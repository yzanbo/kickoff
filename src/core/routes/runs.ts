import type { Hono } from "hono";
import { z } from "zod";
import { addWorktree, worktreePathFor } from "../git.js";
import type { ServerDeps } from "../server.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES } from "../types.js";
import { badRequest, conflictOnError, HttpError, requireGroupOf, requireProject, requireRun, requireWorktree } from "./http.js";
import { branchName, optionalId, queryOf } from "./schemas.js";
import { forkRun } from "../runFork.js";

const runOptionsSchema = z
  .object({
    model: z.string().max(100).nullable(),
    effort: z.enum(EFFORT_LEVELS).nullable(),
    permission_mode: z.enum(PERMISSION_CHOICES).nullable(),
    fast_mode: z.boolean().nullable(),
  })
  .partial()
  .default({});

const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(300),
  mime: z.string().max(200),
  size: z.number().int().nonnegative(),
});

// 本文が空でも、添付があれば送れる
const runInputSchema = z
  .object({
    prompt: z.string().trim().max(50_000).default(""),
    options: runOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
    group_id: z.number().int().optional(),
    // 作業場所: いまあるワークツリーのフォルダ、または新しく作るワークツリーのブランチ名（どちらもなければ本体）
    worktree_path: z.string().max(2000).optional(),
    new_worktree_branch: branchName.optional(),
  })
  .refine((v) => v.prompt || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });

const messageInputSchema = z
  .object({
    text: z.string().trim().max(50_000).default(""),
    options: runOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
  })
  .refine((v) => v.text || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });

/** チャット（エージェントとの会話）: 始める・続ける・中断・名前や列の変更・アーカイブ・削除・検索 */
export function runRoutes(app: Hono, { store, runner, approvals, providers }: ServerDeps) {
  // ?archived=1 でアーカイブしたチャットも含める
  // プロジェクトのチャット。アーカイブ済みも含めるときは、未アーカイブとアーカイブ済みを別々に上限まで取る
  // （アーカイブ済みが多くても、未アーカイブのチャットが一覧から落ちないように）
  app.get("/api/projects/:id/runs", (c) => {
    const projectId = requireProject(store, c.req.param("id")).id;
    const active = store.listRuns({ projectId, limit: 300 });
    const archived = c.req.query("archived") === "1" ? store.listRuns({ projectId, limit: 300, onlyArchived: true }) : [];
    return c.json([...active, ...archived].sort((a, b) => b.id - a.id));
  });

  app.post("/api/projects/:id/runs", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const input = runInputSchema.parse(await c.req.json());
    if (input.group_id !== undefined) requireGroupOf(store, input.group_id, project.id);
    const worktreePath = await resolveWorktree(project.repo_path, input.worktree_path, input.new_worktree_branch);
    const run = await runner.start({
      projectId: project.id,
      prompt: input.prompt,
      options: input.options,
      attachments: input.attachments,
      groupId: input.group_id,
      worktreePath,
    });
    return c.json(run, 201);
  });

  // チャットのやり取りのキーワード検索（⌘F）
  app.get("/api/search", (c) => {
    const { q, project_id, run_id, limit } = z
      .object({ q: z.string().max(1000).default(""), project_id: optionalId, run_id: optionalId, limit: optionalId })
      .parse({ q: queryOf(c, "q"), project_id: queryOf(c, "project_id"), run_id: queryOf(c, "run_id"), limit: queryOf(c, "limit") });
    return c.json(store.searchEvents(q, { projectId: project_id, runId: run_id, limit }));
  });

  // 全プロジェクトのチャット（⌘K の検索・移動用）。件数は 1000 まで
  app.get("/api/runs", (c) => {
    const { limit } = z.object({ limit: z.coerce.number().int().positive().default(300) }).parse({ limit: queryOf(c, "limit") });
    return c.json(store.listRuns({ limit: Math.min(limit, 1000), includeArchived: c.req.query("archived") === "1" }));
  });

  app.get("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json({ run, events: store.listEvents(run.id), approvals: approvals.list({ runId: run.id }), queue: runner.queued(run.id) });
  });

  // チャットの名前・グループを変える（カンバンの列は AI の状態で決まるので変えない）
  app.patch("/api/runs/:id", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { group_id, ...patch } = z
      .object({
        title: z.string().trim().min(1).max(100),
        group_id: z.number().int().nullable(),
      })
      .partial()
      .parse(await c.req.json());
    if (group_id !== undefined) {
      if (group_id !== null) requireGroupOf(store, group_id, run.project_id);
      store.setRunGroup(run.id, group_id);
    }
    return c.json(Object.keys(patch).length ? store.updateRun(run.id, patch) : store.getRun(run.id));
  });

  // チャットを開いて確認した（確認待ちを消す）
  app.post("/api/runs/:id/seen", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json(run.attention ? store.setRunAttention(run.id, false) : run);
  });

  // 未読にする（確認待ちに戻す。次に開くまで残る）
  app.post("/api/runs/:id/unseen", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json(run.attention ? run : store.setRunAttention(run.id, true));
  });

  // サイドバーの上に固定する・やめる
  app.post("/api/runs/:id/pin", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { pinned } = z.object({ pinned: z.boolean() }).parse(await c.req.json());
    return c.json(store.setRunPinned(run.id, pinned));
  });

  // アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す
  app.post("/api/runs/:id/archive", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(await c.req.json().catch(() => ({})));
    if (archived && runner.isBusy(run.id)) throw new HttpError(409, "作業中のチャットはアーカイブできません。中断してから行ってください");
    return c.json(store.updateRun(run.id, { archived_at: archived ? new Date().toISOString() : null }));
  });

  // 削除（会話の記録も消える）
  app.delete("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    if (runner.isBusy(run.id)) throw new HttpError(409, "作業中のチャットは削除できません。中断してから行ってください");
    store.deleteRun(run.id);
    runner.forgetQueued(run.id);
    return c.json({ ok: true });
  });

  app.post("/api/runs/:id/messages", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    // 作業中のチャットには送れない（409）
    return c.json(await conflictOnError(() => runner.send(run.id, text, options, attachments)));
  });

  // 次の指示を送る。作業中なら待ちの列に入れ、終わったら順に送る（作業中でなければすぐ送る）
  app.post("/api/runs/:id/queue", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    return c.json(await conflictOnError(() => runner.queueMessage(run.id, text, options, attachments)));
  });

  // 待ちの列から消す
  app.delete("/api/runs/:id/queue/:queueId", (c) => {
    const run = requireRun(store, c.req.param("id"));
    if (!runner.removeQueued(run.id, c.req.param("queueId"))) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの指示の文を書き換える
  app.patch("/api/runs/:id/queue/:queueId", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text } = z.object({ text: z.string().max(50_000) }).parse(await c.req.json());
    if (!(await badRequest(async () => runner.editQueued(run.id, c.req.param("queueId"), text)))) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの列を並べ替える（index は移したあとの位置）
  app.post("/api/runs/:id/queue/:queueId/move", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { index } = z.object({ index: z.number().int().min(0) }).parse(await c.req.json());
    if (!runner.moveQueued(run.id, c.req.param("queueId"), index)) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ queue: runner.queued(run.id) });
  });

  // 待ちの 1 件をすぐ送る（作業中なら、いまの作業を止めてから送る）
  app.post("/api/runs/:id/queue/:queueId/send", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const sent = await conflictOnError(() => runner.sendQueuedNow(run.id, c.req.param("queueId")));
    if (!sent) throw new HttpError(404, "待ちの指示が見つかりません");
    return c.json({ ok: true });
  });

  // 作業の終わり（result イベント）の時点から、新しいチャットに分岐する（作業中は 409、分岐できない時点は 400）
  app.post("/api/runs/:id/fork", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { event_id } = z.object({ event_id: z.number().int() }).parse(await c.req.json());
    if (runner.isBusy(run.id)) throw new HttpError(409, "作業中は分岐できません。終わってから行ってください");
    const project = requireProject(store, String(run.project_id));
    const forked = await badRequest(() => forkRun({ store, providers }, run, event_id, run.worktree_path || project.repo_path));
    return c.json(forked, 201);
  });

  // 会話を要約して、コンテキストを空ける（手で圧縮する。作業中・まだ会話がなければ 409）
  app.post("/api/runs/:id/compact", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json(await conflictOnError(() => runner.compact(run.id)));
  });

  app.post("/api/runs/:id/cancel", (c) => {
    const run = requireRun(store, c.req.param("id"));
    runner.cancel(run.id);
    return c.json({ ok: true });
  });
}

/**
 * チャットの作業場所（DB に入れる worktree_path）を決める。新しいブランチ名があればワークツリーを作り（作れなければ 400）、
 * フォルダの指定があればこのプロジェクトのワークツリーか確かめる（requireWorktree）。本体は空
 */
async function resolveWorktree(repo: string, worktreePath?: string, newBranch?: string): Promise<string> {
  if (newBranch) {
    return badRequest(async () => {
      const target = await worktreePathFor(repo, newBranch);
      await addWorktree(repo, newBranch);
      return target;
    });
  }
  const found = await requireWorktree(repo, worktreePath);
  return found && !found.main ? found.path : "";
}
