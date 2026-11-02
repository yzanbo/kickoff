import { errorMessage } from "../errors.js";
import { addWorktree, listWorktrees, worktreePathFor } from "../git.js";
import type { Hono } from "hono";
import { z } from "zod";
import type { ServerDeps } from "../server.js";
import { EFFORT_LEVELS, PERMISSION_CHOICES, PHASES } from "../types.js";
import { HttpError, requireGroup, requireProject, requireRun } from "./http.js";

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
    phase: z.enum(PHASES),
    task_id: z.number().int().optional(),
    prompt: z.string().trim().max(50_000).default(""),
    options: runOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
    group_id: z.number().int().optional(),
    // 作業場所: いまあるワークツリーのフォルダ、または新しく作るワークツリーのブランチ名（どちらもなければ本体）
    worktree_path: z.string().max(2000).optional(),
    new_worktree_branch: z.string().trim().min(1).max(200).optional(),
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
export function runRoutes(app: Hono, { store, runner, approvals }: ServerDeps) {
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
    if (input.group_id !== undefined && requireGroup(store, String(input.group_id)).project_id !== project.id) {
      throw new HttpError(400, "ほかのプロジェクトのグループには入れられません");
    }
    const worktreePath = await resolveWorktree(project.repo_path, input.worktree_path, input.new_worktree_branch);
    const run = await runner.start({
      projectId: project.id,
      phase: input.phase,
      taskId: input.task_id,
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
    const num = (v: string | undefined) => (v ? Number(v) : undefined);
    return c.json(
      store.searchEvents(c.req.query("q") ?? "", {
        projectId: num(c.req.query("project_id")),
        runId: num(c.req.query("run_id")),
        limit: num(c.req.query("limit")),
      }),
    );
  });

  // 全プロジェクトのチャット（⌘K の検索・移動用）
  app.get("/api/runs", (c) =>
    c.json(store.listRuns({ limit: Math.min(Number(c.req.query("limit") ?? 300), 1000), includeArchived: c.req.query("archived") === "1" })),
  );

  app.get("/api/runs/:id", (c) => {
    const run = requireRun(store, c.req.param("id"));
    return c.json({ run, events: store.listEvents(run.id), approvals: approvals.list({ runId: run.id }) });
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
      if (group_id !== null && requireGroup(store, String(group_id)).project_id !== run.project_id) {
        throw new HttpError(400, "ほかのプロジェクトのグループには入れられません");
      }
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
    return c.json({ ok: true });
  });

  app.post("/api/runs/:id/messages", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    try {
      return c.json(await runner.send(run.id, text, options, attachments));
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
  });

  // 会話を要約して、コンテキストを空ける（手で圧縮する）
  app.post("/api/runs/:id/compact", async (c) => {
    const run = requireRun(store, c.req.param("id"));
    try {
      return c.json(await runner.compact(run.id));
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
  });

  app.post("/api/runs/:id/cancel", (c) => {
    const run = requireRun(store, c.req.param("id"));
    runner.cancel(run.id);
    return c.json({ ok: true });
  });
}

/**
 * チャットの作業場所を決める。新しいブランチ名があればワークツリーを作り、フォルダの指定があれば
 * このプロジェクトのワークツリーか確かめる（本体・知らないフォルダは本体＝空にする）
 */
async function resolveWorktree(repo: string, worktreePath?: string, newBranch?: string): Promise<string> {
  try {
    if (newBranch) {
      const target = await worktreePathFor(repo, newBranch);
      await addWorktree(repo, newBranch);
      return target;
    }
    if (!worktreePath) return "";
    const found = (await listWorktrees(repo)).find((w) => w.path === worktreePath);
    if (!found) throw new Error("このプロジェクトのワークツリーではありません");
    return found.main ? "" : found.path;
  } catch (e) {
    throw new HttpError(400, errorMessage(e));
  }
}
