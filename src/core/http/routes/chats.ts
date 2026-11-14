import type { Context, Hono } from "hono";
import { z } from "zod";
import { addWorktree, worktreePathFor } from "../../git/index.js";
import type { ServerDeps } from "../server.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups, requireGroupOf, requireProject } from "../lookups.js";
import { requireWorktree } from "../workdir.js";
import { chatTitle, flag, githubLinkSchema, newChatSchema, optionalId } from "./schemas.js";
import { chatTranscript } from "../../chat/transcript.js";
import { detachChat } from "../../chat/detach.js";
import { trashChat } from "../../trash/chatTrash.js";
import { CHAT_DETAIL_LIMIT_MAX, type ChatDetachBody, type ChatDetail, type ChatDetailQuery, type ChatEvent, type ChatPatch, type ChatTranscript, type GitWorktree } from "@shared/types";

/**
 * チャットの一覧の絞り込み（並びは最後に動いた順）: ?archived=1 でアーカイブ済みだけ（なければアーカイブしていないものだけ）。
 * 件数は ?limit= で絞れるが、省けばすべて返す（以前は 300 件で黙って切っていて、古い作業中のチャットが画面の一覧から落ちることがあった）
 */
function chatListFilter(c: Context) {
  const { archived, limit } = z.object({ archived: flag.optional(), limit: optionalId }).parse({ archived: queryOf(c, "archived"), limit: queryOf(c, "limit") });
  return { limit, onlyArchived: archived === "1" };
}

/** チャットの詳細の記録の読み方（after と before は一緒に使えない。before には limit が要る） */
const detailQuerySchema = z
  .object({ after: optionalId, before: optionalId, limit: z.coerce.number().int().min(1).max(CHAT_DETAIL_LIMIT_MAX).optional() })
  .refine((q) => q.after === undefined || (q.before === undefined && q.limit === undefined), "after は before・limit と一緒に使えません")
  .refine((q) => q.before === undefined || q.limit !== undefined, "before には limit が要ります") satisfies z.ZodType<ChatDetailQuery>;

/** チャットの変更（書いた項目だけ。プロジェクトの PATCH と同じ形で、固定・アーカイブもここ） */
/** 子チャットを親から外す（parent_chat_id: null = 親なし / 先祖の ID = その子に。group_id は親なしにするときだけ） */
const chatDetachSchema = z.object({
  parent_chat_id: z.number().int().positive().nullable(),
  group_id: z.number().int().positive().nullable().optional(),
}) satisfies z.ZodType<ChatDetachBody>;

const chatPatchSchema = z
  .object({
    title: chatTitle,
    group_id: z.number().int().nullable(),
    // サイドバーの上に固定する・やめる（並び順は変えない）
    pinned: z.boolean(),
    // アーカイブ（一覧から隠す。会話の記録は残る）・戻す。作業中はアーカイブできない
    archived: z.boolean(),
  })
  .partial() satisfies z.ZodType<ChatPatch>;

/**
 * チャット（エージェントとの会話）の資源: 一覧・始める・詳細・変更（名前・グループ・固定・アーカイブ）・既読・別のプロジェクトへの移動・削除・検索。
 * 送る・伝える・止める・分岐・巻き戻しは routes/turns.ts。変えたら、変えたあとのチャットを返す（削除は 204）
 */
export function chatRoutes(app: Hono, { store, runner, approvals, databases, providers, worktreeEnvs, trashBin }: ServerDeps) {
  const { withProject, withChat } = lookups(store);

  // プロジェクトのチャット（絞り込みは全プロジェクトの一覧と同じ）
  app.get("/api/projects/:id/chats", withProject, (c) => c.json(store.chats.list({ ...chatListFilter(c), projectId: c.var.project.id })));

  app.post("/api/projects/:id/chats", withProject, async (c) => {
    const { project } = c.var;
    const input = newChatSchema.parse(await jsonBody(c));
    if (input.group_id !== undefined) requireGroupOf(store, input.group_id, project.id);
    const worktreePath = await resolveWorktree(project.repo_path, input.worktree_path, input.new_worktree_branch, (made) => worktreeEnvs.prepare(project, made));
    const created = await runner.start({
      projectId: project.id,
      prompt: input.text,
      title: input.title,
      options: input.options,
      attachments: input.attachments,
      groupId: input.group_id,
      worktreePath,
      github: input.github,
    });
    return c.json(created, 201);
  });

  // GitHub の issue・PR を結び付ける・外す（並び順は変えない）
  app.put("/api/chats/:id/github", withChat, async (c) => c.json(store.chats.setGitHub(c.var.chat.id, githubLinkSchema.parse(await jsonBody(c)))));
  app.delete("/api/chats/:id/github", withChat, (c) => c.json(store.chats.setGitHub(c.var.chat.id, null)));

  // チャットのやり取りのキーワード検索（⌘F）
  // 手動の並び（サイドバーの並び順「手動順」）を ids の順にする。並べたチャットを並びの順に返す
  app.put("/api/projects/:id/chats/order", withProject, async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await jsonBody(c));
    return c.json(store.chats.reorder(c.var.project.id, ids));
  });

  app.get("/api/search", (c) => {
    const { q, project_id, chat_id, limit } = z
      .object({ q: z.string().max(1000).default(""), project_id: optionalId, chat_id: optionalId, limit: optionalId })
      .parse({ q: queryOf(c, "q"), project_id: queryOf(c, "project_id"), chat_id: queryOf(c, "chat_id"), limit: queryOf(c, "limit") });
    return c.json(store.events.search(q, { projectId: project_id, chatId: chat_id, limit }));
  });

  // フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答 1 件。返答の新しい順
  app.get("/api/feed", (c) => {
    const { limit } = z.object({ limit: optionalId }).parse({ limit: queryOf(c, "limit") });
    return c.json(store.events.feed(limit));
  });

  // 全プロジェクトのチャット（画面はこれを 1 回読み、あとは知らせで直す）
  app.get("/api/chats", (c) => c.json(store.chats.list(chatListFilter(c))));

  // チャットの詳細（作業中の様子 live は SSE の chat_live と同じ形。画面はそれで追いかける）
  // チャットの詳細。記録はクエリで絞れる（ChatDetail の説明。つなぎ直したときは after、スマホは limit と before で少しずつ）
  app.get("/api/chats/:id", withChat, (c) => {
    const { chat } = c.var;
    const { after, before, limit } = detailQuerySchema.parse({ after: queryOf(c, "after"), before: queryOf(c, "before"), limit: queryOf(c, "limit") });
    let events: ChatEvent[];
    let hasEarlier = false;
    let afterMissing = false;
    if (after !== undefined) {
      afterMissing = !store.events.has(chat.id, after);
      events = afterMissing ? [] : store.events.after(chat.id, after);
    } else if (limit !== undefined) {
      events = store.events.before(chat.id, before ?? null, limit);
      hasEarlier = events.length > 0 && store.events.hasBefore(chat.id, events[0].id);
    } else {
      events = store.events.list(chat.id);
    }
    const detail: ChatDetail = { chat, events, has_earlier: hasEarlier, after_missing: afterMissing, approvals: approvals.list({ chatId: chat.id }), live: runner.live(chat.id) };
    return c.json(detail);
  });

  // チャットのやり取りの記録（Markdown。右クリックの「全部のやり取りをコピー」。画面が描いている範囲に関係なく、初めからすべて）
  app.get("/api/chats/:id/transcript", withChat, (c) => {
    const { chat } = c.var;
    const transcript: ChatTranscript = { markdown: chatTranscript(chat, requireProject(store, chat.project_id), store.events.list(chat.id), { note: false }) };
    return c.json(transcript);
  });

  // チャットの名前・グループ・固定・アーカイブを変える（カンバンの列は AI の状態で決まるので変えない）。
  // 確かめ（ほかのプロジェクトのグループ・作業中のアーカイブ）を先にすべて済ませてから変える（途中まで変えて断らない）
  app.patch("/api/chats/:id", withChat, async (c) => {
    const { chat } = c.var;
    const { title, group_id, pinned, archived } = chatPatchSchema.parse(await jsonBody(c));
    if (group_id !== undefined && group_id !== null) requireGroupOf(store, group_id, chat.project_id);
    // 子チャット（子・孫…）も一緒にしまう（作業中のものがあればしまえない）。戻すときは、一緒にしまった子孫だけを戻す（store.chats.archive）
    if (archived) for (const c of [chat, ...store.chats.descendants(chat.id)]) if (c.archived_at === null) runner.requireIdle(c.id, "アーカイブ");
    if (group_id !== undefined) store.chats.setGroup(chat.id, group_id);
    if (pinned !== undefined) store.chats.setPinned(chat.id, pinned);
    if (title !== undefined) store.chats.update(chat.id, { title });
    if (archived !== undefined) store.chats.archive(chat.id, archived);
    return c.json(store.chats.get(chat.id));
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

  /**
   * 子チャットを親から外す（親のないチャットにする・自分の先祖の子に上げる。chat/detach.ts）。先祖でない ID・親なしでないときのグループ・
   * ほかのプロジェクトのグループ・親のないチャットは 400、作業中は 409。外したあとのチャットを返す（知らせは店から）
   */
  app.post("/api/chats/:id/detach", withChat, async (c) => {
    const body = chatDetachSchema.parse(await jsonBody(c));
    return c.json(detachChat(store, (id) => runner.isBusy(id), c.var.chat, { parentId: body.parent_chat_id, groupId: body.group_id ?? null }));
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
    // 子チャット（子・孫…）も一緒に移す
    const family = store.chats.descendants(chat.id);
    for (const c of [chat, ...family]) runner.requireIdle(c.id, "移動");
    for (const c of family) store.chats.move(c.id, target.id);
    return c.json(store.chats.move(chat.id, target.id));
  });

  // 削除 = Kickoff のゴミ箱へ（子チャット（子・孫…）・会話の記録・会話記録のファイル・添付ごと。3 日は戻せ、3 日たったら本当に消す。
  // 作業中のものがあれば消せない）。入れたゴミ箱の ID を返す（画面の「元に戻す」）
  app.delete("/api/chats/:id", withChat, (c) => {
    const item = trashChat({ store, trashBin, runner }, c.var.chat);
    return c.json({ trash_id: item.id });
  });
}

/**
 * チャットの作業場所（DB に入れる worktree_path）を決める。新しいブランチ名があればワークツリーを作り（作れなければ 400）、
 * フォルダの指定があればこのプロジェクトのワークツリーか確かめる（requireWorktree）。本体は空。新しく作ったら onCreated（ワークツリーの実行環境）
 */
async function resolveWorktree(repo: string, worktreePath?: string, newBranch?: string, onCreated?: (worktree: GitWorktree) => Promise<void>): Promise<string> {
  if (newBranch) {
    const target = await worktreePathFor(repo, newBranch);
    await addWorktree(repo, newBranch, onCreated);
    return target;
  }
  const found = await requireWorktree(repo, worktreePath);
  return found && !found.main ? found.path : "";
}
