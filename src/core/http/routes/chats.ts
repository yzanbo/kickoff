import type { Hono } from "hono";
import { z } from "zod";
import { addWorktree, worktreePathFor } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { badRequest, conflictOnError, HttpError, requireGroupOf, requireProject, requireChat, requireWorktree } from "./http.js";
import { attachmentSchema, branchName, messageInputSchema, optionalId, queryOf, chatOptionsSchema } from "./schemas.js";
import { forkChat } from "../../chat/fork.js";
import { rewindFiles, rewindChat, ChatBusyError } from "../../chat/rewind.js";

// 本文が空でも、添付があれば送れる
const chatInputSchema = z
  .object({
    prompt: z.string().trim().max(50_000).default(""),
    options: chatOptionsSchema,
    attachments: z.array(attachmentSchema).max(20).default([]),
    group_id: z.number().int().optional(),
    // 作業場所: いまあるワークツリーのフォルダ、または新しく作るワークツリーのブランチ名（どちらもなければ本体）
    worktree_path: z.string().max(2000).optional(),
    new_worktree_branch: branchName.optional(),
  })
  .refine((v) => v.prompt || v.attachments.length > 0, { message: "メッセージか添付ファイルが必要です" });

/** チャット（エージェントとの会話）: 始める・続ける・中断・名前や列の変更・アーカイブ・削除・検索 */
export function chatRoutes(app: Hono, { store, runner, approvals, providers }: ServerDeps) {
  // ?archived=1 でアーカイブしたチャットも含める
  // プロジェクトのチャット。アーカイブ済みも含めるときは、未アーカイブとアーカイブ済みを別々に上限まで取る
  // （アーカイブ済みが多くても、未アーカイブのチャットが一覧から落ちないように）
  app.get("/api/projects/:id/chats", (c) => {
    const projectId = requireProject(store, c.req.param("id")).id;
    const active = store.chats.list({ projectId, limit: 300 });
    const archived = c.req.query("archived") === "1" ? store.chats.list({ projectId, limit: 300, onlyArchived: true }) : [];
    return c.json([...active, ...archived].sort((a, b) => b.id - a.id));
  });

  app.post("/api/projects/:id/chats", async (c) => {
    const project = requireProject(store, c.req.param("id"));
    const input = chatInputSchema.parse(await c.req.json());
    if (input.group_id !== undefined) requireGroupOf(store, input.group_id, project.id);
    const worktreePath = await resolveWorktree(project.repo_path, input.worktree_path, input.new_worktree_branch);
    const chat = await runner.start({
      projectId: project.id,
      prompt: input.prompt,
      options: input.options,
      attachments: input.attachments,
      groupId: input.group_id,
      worktreePath,
    });
    return c.json(chat, 201);
  });

  // チャットのやり取りのキーワード検索（⌘F）
  app.get("/api/search", (c) => {
    const { q, project_id, chat_id, limit } = z
      .object({ q: z.string().max(1000).default(""), project_id: optionalId, chat_id: optionalId, limit: optionalId })
      .parse({ q: queryOf(c, "q"), project_id: queryOf(c, "project_id"), chat_id: queryOf(c, "chat_id"), limit: queryOf(c, "limit") });
    return c.json(store.events.search(q, { projectId: project_id, chatId: chat_id, limit }));
  });

  // 全プロジェクトのチャット（⌘K の検索・移動用）。件数は 1000 まで
  app.get("/api/chats", (c) => {
    const { limit } = z.object({ limit: z.coerce.number().int().positive().default(300) }).parse({ limit: queryOf(c, "limit") });
    return c.json(store.chats.list({ limit: Math.min(limit, 1000), includeArchived: c.req.query("archived") === "1" }));
  });

  app.get("/api/chats/:id", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    return c.json({ chat, events: store.events.list(chat.id), approvals: approvals.list({ chatId: chat.id }), queue: runner.queued(chat.id), queue_paused: runner.queuePaused(chat.id), queue_stops: runner.queueStops(chat.id), queue_waiting_edit: runner.queueWaitingForEdit(chat.id), reconnect: runner.reconnectState(chat.id), background: runner.backgroundState(chat.id), compacting: runner.compactingSince(chat.id), stopping: runner.isStopping(chat.id) });
  });

  // チャットの名前・グループを変える（カンバンの列は AI の状態で決まるので変えない）
  app.patch("/api/chats/:id", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { group_id, ...patch } = z
      .object({
        title: z.string().trim().min(1).max(100),
        group_id: z.number().int().nullable(),
      })
      .partial()
      .parse(await c.req.json());
    if (group_id !== undefined) {
      if (group_id !== null) requireGroupOf(store, group_id, chat.project_id);
      store.chats.setGroup(chat.id, group_id);
    }
    return c.json(Object.keys(patch).length ? store.chats.update(chat.id, patch) : store.chats.get(chat.id));
  });

  // 確認した（未読を消す）。event_id = 画面で一番下まで見た記録。それより新しい返答が届いていれば、まだ見ていないので消さない
  // （event_id がなければ、メニューの「既読にする」などで、そのまま消す）
  app.post("/api/chats/:id/seen", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { event_id } = z.object({ event_id: z.number().int().optional() }).parse(await c.req.json().catch(() => ({})));
    if (!chat.unread || (event_id !== undefined && store.events.latestUnreadId(chat.id) > event_id)) return c.json(chat);
    return c.json(store.chats.setUnread(chat.id, false));
  });

  // 未読にする（未読に戻す。次に開くまで残る）
  app.post("/api/chats/:id/unseen", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    return c.json(chat.unread ? chat : store.chats.setUnread(chat.id, true));
  });

  // サイドバーの上に固定する・やめる
  app.post("/api/chats/:id/pin", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { pinned } = z.object({ pinned: z.boolean() }).parse(await c.req.json());
    return c.json(store.chats.setPinned(chat.id, pinned));
  });

  // アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す
  app.post("/api/chats/:id/archive", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(await c.req.json().catch(() => ({})));
    if (archived && runner.isBusy(chat.id)) throw new HttpError(409, "作業中のチャットはアーカイブできません。中断してから行ってください");
    return c.json(store.chats.update(chat.id, { archived_at: archived ? new Date().toISOString() : null }));
  });

  // 削除（会話の記録も消える）
  app.delete("/api/chats/:id", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    if (runner.isBusy(chat.id)) throw new HttpError(409, "作業中のチャットは削除できません。中断してから行ってください");
    store.chats.delete(chat.id);
    runner.forgetQueued(chat.id);
    return c.json({ ok: true });
  });

  app.post("/api/chats/:id/messages", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    // 作業中のチャットには送れない（409）
    return c.json(await conflictOnError(() => runner.send(chat.id, text, options, attachments)));
  });

  // 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる（待っていなければ 404）
  app.delete("/api/chats/:id/reconnect", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    if (!runner.stopReconnect(chat.id)) throw new HttpError(404, "つながるのを待っていません");
    return c.json({ ok: true });
  });

  // 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る）
  app.post("/api/chats/:id/tell", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { text, options, attachments } = messageInputSchema.parse(await c.req.json());
    return c.json({ result: await conflictOnError(() => runner.tell(chat.id, text, options, attachments)) });
  });

  // 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ 404）
  app.post("/api/chats/:id/background/:taskId/stop", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    if (!(await runner.stopBackgroundTask(chat.id, c.req.param("taskId")))) throw new HttpError(404, "このチャットは作業中ではありません");
    return c.json({ ok: true });
  });

  // 作業の終わり（result イベント）の時点から、新しいチャットに分岐する（作業中は 409、分岐できない時点は 400）
  app.post("/api/chats/:id/fork", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { event_id } = z.object({ event_id: z.number().int() }).parse(await c.req.json());
    if (runner.isBusy(chat.id)) throw new HttpError(409, "作業中は分岐できません。終わってから行ってください");
    const project = requireProject(store, String(chat.project_id));
    const forked = await badRequest(() => forkChat({ store, providers }, chat, event_id, chat.worktree_path || project.repo_path));
    return c.json(forked, 201);
  });

  // 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restore_files ならファイルも
  // その発言を送る前の状態に戻す。作業中は 409、巻き戻せない発言・プロバイダー・ファイルを戻せないときは 400）
  app.post("/api/chats/:id/rewind", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { event_id, text, options, restore_files } = z
      .object({ event_id: z.number().int(), text: z.string().trim().max(50_000).default(""), options: chatOptionsSchema, restore_files: z.boolean().default(false) })
      .parse(await c.req.json());
    const project = requireProject(store, String(chat.project_id));
    const cwd = chat.worktree_path || project.repo_path;
    return c.json(
      await badRequest(() => rewindChat({ store, runner, providers }, chat, { eventId: event_id, text, options, cwd, restoreFiles: restore_files }), ChatBusyError),
    );
  });

  // ファイルだけを、自分の発言を送る前の状態に戻す（会話はそのまま）。dry_run なら戻さずに、変わるファイルと行の増減だけを返す
  // （作業中は 409、戻せない発言（ファイルの記録がない）・プロバイダーは 400）
  app.post("/api/chats/:id/rewind-files", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    const { event_id, dry_run } = z.object({ event_id: z.number().int(), dry_run: z.boolean().default(false) }).parse(await c.req.json());
    const project = requireProject(store, String(chat.project_id));
    const cwd = chat.worktree_path || project.repo_path;
    return c.json(await badRequest(() => rewindFiles({ store, runner, providers }, chat, { eventId: event_id, cwd, dryRun: dry_run }), ChatBusyError));
  });

  // 会話を要約して、コンテキストを空ける（手で圧縮する。作業中・まだ会話がなければ 409）
  app.post("/api/chats/:id/compact", async (c) => {
    const chat = requireChat(store, c.req.param("id"));
    return c.json(await conflictOnError(() => runner.compact(chat.id)));
  });

  app.post("/api/chats/:id/cancel", (c) => {
    const chat = requireChat(store, c.req.param("id"));
    runner.cancel(chat.id);
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
