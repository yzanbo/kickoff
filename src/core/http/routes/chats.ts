import type { Hono } from "hono";
import { z } from "zod";
import { addWorktree, worktreePathFor } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups, requireGroupOf, requireProject } from "../lookups.js";
import { requireWorktree } from "../workdir.js";
import { attachmentSchema, branchName, optionalId, chatOptionsSchema } from "./schemas.js";
import type { ChatDetail } from "@shared/types";

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

/**
 * チャット（エージェントとの会話）の資源: 一覧・始める・詳細・名前やグループの変更・既読・固定・アーカイブ・別のプロジェクトへの移動・削除・検索。
 * 送る・伝える・止める・分岐・巻き戻しは routes/turns.ts
 */
export function chatRoutes(app: Hono, { store, runner, approvals }: ServerDeps) {
  const { withProject, withChat } = lookups(store);

  // ?archived=1 でアーカイブしたチャットも含める
  // プロジェクトのチャット。アーカイブ済みも含めるときは、未アーカイブとアーカイブ済みを別々に上限まで取る
  // （アーカイブ済みが多くても、未アーカイブのチャットが一覧から落ちないように）
  app.get("/api/projects/:id/chats", withProject, (c) => {
    const projectId = c.var.project.id;
    const active = store.chats.list({ projectId, limit: 300 });
    const archived = c.req.query("archived") === "1" ? store.chats.list({ projectId, limit: 300, onlyArchived: true }) : [];
    return c.json([...active, ...archived].sort((a, b) => b.id - a.id));
  });

  app.post("/api/projects/:id/chats", withProject, async (c) => {
    const { project } = c.var;
    const input = chatInputSchema.parse(await jsonBody(c));
    if (input.group_id !== undefined) requireGroupOf(store, input.group_id, project.id);
    const worktreePath = await resolveWorktree(project.repo_path, input.worktree_path, input.new_worktree_branch);
    const created = await runner.start({
      projectId: project.id,
      prompt: input.prompt,
      options: input.options,
      attachments: input.attachments,
      groupId: input.group_id,
      worktreePath,
    });
    return c.json(created, 201);
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

  // チャットの詳細（作業中の様子 live は SSE の chat_live と同じ形。画面はそれで追いかける）
  app.get("/api/chats/:id", withChat, (c) => {
    const { chat } = c.var;
    const detail: ChatDetail = { chat, events: store.events.list(chat.id), approvals: approvals.list({ chatId: chat.id }), live: runner.live(chat.id) };
    return c.json(detail);
  });

  // チャットの名前・グループを変える（カンバンの列は AI の状態で決まるので変えない）
  app.patch("/api/chats/:id", withChat, async (c) => {
    const { chat } = c.var;
    const { group_id, ...patch } = z
      .object({
        title: z.string().trim().min(1).max(100),
        group_id: z.number().int().nullable(),
      })
      .partial()
      .parse(await jsonBody(c));
    if (group_id !== undefined) {
      if (group_id !== null) requireGroupOf(store, group_id, chat.project_id);
      store.chats.setGroup(chat.id, group_id);
    }
    return c.json(Object.keys(patch).length ? store.chats.update(chat.id, patch) : store.chats.get(chat.id));
  });

  // 確認した（未読を消す）。event_id = 画面で一番下まで見た記録。それより新しい返答が届いていれば、まだ見ていないので消さない
  // （event_id がなければ、メニューの「既読にする」などで、そのまま消す）
  app.post("/api/chats/:id/seen", withChat, async (c) => {
    const { chat } = c.var;
    const { event_id } = z.object({ event_id: z.number().int().optional() }).parse(await jsonBody(c));
    if (!chat.unread || (event_id !== undefined && store.events.latestUnreadId(chat.id) > event_id)) return c.json(chat);
    return c.json(store.chats.setUnread(chat.id, false));
  });

  // 未読にする（未読に戻す。次に開くまで残る）
  app.post("/api/chats/:id/unseen", withChat, (c) => {
    const { chat } = c.var;
    return c.json(chat.unread ? chat : store.chats.setUnread(chat.id, true));
  });

  // サイドバーの上に固定する・やめる
  app.post("/api/chats/:id/pin", withChat, async (c) => {
    const { pinned } = z.object({ pinned: z.boolean() }).parse(await jsonBody(c));
    return c.json(store.chats.setPinned(c.var.chat.id, pinned));
  });

  // アーカイブ（一覧から隠す。会話の記録は残る）/ 戻す
  app.post("/api/chats/:id/archive", withChat, async (c) => {
    const { chat } = c.var;
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(await jsonBody(c));
    if (archived) runner.requireIdle(chat.id, "アーカイブ");
    return c.json(store.chats.update(chat.id, { archived_at: archived ? new Date().toISOString() : null }));
  });

  /**
   * 別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。グループ・作業場所（ワークツリー）は元のプロジェクトのものなので外し、
   * 作業場所は移った先の本体にする。会話（Claude Code のセッション）は作業フォルダが変わっても続けられる。作業中は断る
   */
  app.post("/api/chats/:id/move", withChat, async (c) => {
    const { chat } = c.var;
    const { project_id } = z.object({ project_id: z.number().int().positive() }).parse(await jsonBody(c));
    const target = requireProject(store, project_id);
    if (target.id === chat.project_id) return c.json(chat);
    runner.requireIdle(chat.id, "移動");
    return c.json(store.chats.move(chat.id, target.id));
  });

  // 削除（会話の記録も消える）
  app.delete("/api/chats/:id", withChat, (c) => {
    const { chat } = c.var;
    runner.requireIdle(chat.id, "削除");
    store.chats.delete(chat.id);
    runner.forget(chat.id);
    return c.json({ ok: true });
  });
}

/**
 * チャットの作業場所（DB に入れる worktree_path）を決める。新しいブランチ名があればワークツリーを作り（作れなければ 400）、
 * フォルダの指定があればこのプロジェクトのワークツリーか確かめる（requireWorktree）。本体は空
 */
async function resolveWorktree(repo: string, worktreePath?: string, newBranch?: string): Promise<string> {
  if (newBranch) {
    const target = await worktreePathFor(repo, newBranch);
    await addWorktree(repo, newBranch);
    return target;
  }
  const found = await requireWorktree(repo, worktreePath);
  return found && !found.main ? found.path : "";
}
