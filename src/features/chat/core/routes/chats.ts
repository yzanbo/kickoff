import type { Context, Hono } from "hono";
import { z } from "zod";
import { addWorktree, requireWorktree, worktreePathFor } from "@/foundation/core/workplace/worktrees";
import type { ChatRouteDeps } from "./deps";
import { jsonBody, queryOf } from "@/foundation/core/http/input";
import { applyChatUpdate, HTTP_REFUSALS, planChatUpdate, refusedAs } from "@/features/chat/core/update";
import { lookups, requireProject } from "@/foundation/core/http/lookups";
import { requireGroupOf } from "@/features/groups/core/index";
import { chatTitle, githubLinkSchema, newChatSchema } from "@/foundation/core/http/schemas";
import { branchName, flag, optionalId } from "@/foundation/core/http/zodParts";
import { chatTranscript } from "@/features/chat/core/transcript";
import { trashChat } from "@/features/chat/core/sessions/chatTrash";
import { descendantsOf } from "@/features/chat/core/family";
import { planUserWorkplaceMove, workplaceMoveCheck } from "@/features/workplaceMove/core/workplaceUserMove";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { CHAT_DETAIL_LIMIT_MAX, CHAT_TAIL_MAX_BYTES, type ChatDetail, type ChatDetailQuery, type ChatEventPage, type ChatEventsQuery, type ChatPatch, type ChatTexts, type ChatTranscript, type WorkplaceMoveBody } from "@shared/foundation/apiTypes";
import type { GitWorktree } from "@shared/git/types";
import { buildIndex, pageAfter, pageAround, pageBefore, pageSince, scopeEvents, tailStart } from "@/features/chat/core/chatLogQuery";

/**
 * チャットの一覧の絞り込み（並びは最後に動いた順）: ?archived=1 でアーカイブ済みだけ（なければアーカイブしていないものだけ）。
 * 件数は ?limit= で絞れるが、省けばすべて返す（黙って切ると、古い作業中のチャットが画面の一覧から落ちる）
 */
function chatListFilter(c: Context) {
  const { archived, limit } = z.object({ archived: flag.optional(), limit: optionalId }).parse({ archived: queryOf(c, "archived"), limit: queryOf(c, "limit") });
  return { limit, onlyArchived: archived === "1" };
}

/** ターンの数（末尾・ページ） */
const turnsSchema = z.coerce.number().int().min(1).max(200);

/** チャットの詳細の記録の読み方（after と before は一緒に使えない。before には limit が要る。tail_turns はほかと一緒に使えない） */
const detailQuerySchema = z
  .object({ after: optionalId, before: optionalId, limit: z.coerce.number().int().min(1).max(CHAT_DETAIL_LIMIT_MAX).optional(), tail_turns: turnsSchema.optional() })
  .refine((q) => q.after === undefined || (q.before === undefined && q.limit === undefined), "after は before・limit と一緒に使えません")
  .refine((q) => q.before === undefined || q.limit !== undefined, "before には limit が要ります")
  .refine((q) => q.tail_turns === undefined || (q.after === undefined && q.before === undefined && q.limit === undefined), "tail_turns は after・before・limit と一緒に使えません") satisfies z.ZodType<ChatDetailQuery>;

/** , 区切りの呼び出し ID・記録の ID */
const csvIds = z.string().min(1).max(20_000);

/** 記録の一部分の読み方（GET /api/chats/:id/events。ChatEventsQuery のどれか 1 つの形。余計な組み合わせは 400） */
const eventsQuerySchema = z.union([
  z.object({ before: optionalId.unwrap(), turns: turnsSchema }).strict(),
  z.object({ before: optionalId.unwrap(), since: z.coerce.number().int().min(0) }).strict(),
  z.object({ around: optionalId.unwrap(), turns: turnsSchema, until: optionalId }).strict(),
  z.object({ after: z.coerce.number().int().min(0), turns: turnsSchema, until: optionalId }).strict(),
  z.object({ parents: csvIds, ids: csvIds.optional(), before: optionalId.unwrap() }).strict(),
]) satisfies z.ZodType<ChatEventsQuery>;

/** チャットの変更（書いた項目だけ。プロジェクトの PATCH と同じ形で、固定・アーカイブもここ） */
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

export function chatRoutes(app: Hono, { store, streamingText, runner, approvals, worktreeEnvs, trashBin, userSent, terminals }: ChatRouteDeps) {
  const { withProject, withChat } = lookups(store);

  // プロジェクトのチャット（絞り込みは全プロジェクトの一覧と同じ）
  app.get("/api/projects/:id/chats", withProject, (c) => c.json(store.chats.list({ ...chatListFilter(c), projectId: c.var.project.id })));

  app.post("/api/projects/:id/chats", withProject, async (c) => {
    const { project } = c.var;
    const input = newChatSchema.parse(await jsonBody(c));
    if (input.group_id !== undefined) requireGroupOf(store.groups, input.group_id, project.id);
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
      provider: input.provider,
    });
    userSent(c, created.id, input.user_view);
    return c.json(created, 201);
  });

  // GitHub の issue・PR を結び付ける・外す（並び順は変えない）
  app.put("/api/chats/:id/github", withChat, async (c) => c.json(store.chats.setGitHub(c.var.chat.id, githubLinkSchema.parse(await jsonBody(c)))));
  app.delete("/api/chats/:id/github", withChat, (c) => c.json(store.chats.setGitHub(c.var.chat.id, null)));

  // 手動の並び（サイドバーの並び順「手動順」）を ids の順にする。並べたチャットを並びの順に返す
  app.put("/api/projects/:id/chats/order", withProject, async (c) => {
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(await jsonBody(c));
    return c.json(store.chats.reorder(c.var.project.id, ids));
  });
  // チャットのやり取りのキーワード検索（⌘F）
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

  // チャットの詳細（作業中の様子 live は SSE の chat_live と同じ形。画面はそれで追いかける）。
  // 記録はクエリで絞れる（ChatDetail の説明。つなぎ直したときは after、スマホは limit と before で少しずつ）
  app.get("/api/chats/:id", withChat, (c) => {
    const { chat } = c.var;
    const { after, before, limit, tail_turns } = detailQuerySchema.parse({ after: queryOf(c, "after"), before: queryOf(c, "before"), limit: queryOf(c, "limit"), tail_turns: queryOf(c, "tail_turns") });
    let events: ChatEvent[];
    let hasEarlier = false;
    let afterMissing = false;
    let tail: Pick<ChatDetail, "index" | "head_partial"> = {};
    const approvalList = approvals.list({ chatId: chat.id });
    const live = runner.live(chat.id);
    if (tail_turns !== undefined) {
      // 末尾をターンで数えて読み、その前は索引（いまの回答待ち・裏の作業が指す呼び出しも入れる）
      const { start, headPartial } = tailStart(store, chat.id, { turns: tail_turns, maxBytes: CHAT_TAIL_MAX_BYTES });
      events = store.events.range(chat.id, start, Number.MAX_SAFE_INTEGER);
      const first = events[0]?.id ?? Number.MAX_SAFE_INTEGER;
      hasEarlier = store.events.hasBefore(chat.id, first);
      const ctx = {
        approvalCallIds: approvalList.flatMap((a) => (a.tool_use_id ? [a.tool_use_id] : [])),
        backgroundCallIds: (live.background?.tasks ?? []).flatMap((t) => (t.tool_use_id ? [t.tool_use_id] : [])),
      };
      tail = { index: hasEarlier ? buildIndex(store, chat.id, first, ctx) : [], head_partial: headPartial };
    } else if (after !== undefined) {
      afterMissing = !store.events.has(chat.id, after);
      events = afterMissing ? [] : store.events.after(chat.id, after);
    } else if (limit !== undefined) {
      events = store.events.before(chat.id, before ?? null, limit);
      hasEarlier = events.length > 0 && store.events.hasBefore(chat.id, events[0].id);
    } else {
      events = store.events.list(chat.id);
    }
    // 書きかけの返答（返答の途中で開いても文の頭から出せる。このあとに届く chat_delta は offset で重なりを捨てる）
    const streaming = streamingText(chat.id);
    const detail: ChatDetail = {
      chat,
      events,
      has_earlier: hasEarlier,
      after_missing: afterMissing,
      approvals: approvalList,
      live,
      streaming_text: streaming,
      streaming_length: streaming?.length ?? 0,
      ...tail,
    };
    return c.json(detail);
  });

  // 記録の一部分（パソコンの画面が末尾の前を読み足す・遠い所の前後を読む・サブエージェントの中を読む。ChatEventsQuery）
  app.get("/api/chats/:id/events", withChat, (c) => {
    const { chat } = c.var;
    const raw = Object.fromEntries(["before", "turns", "since", "around", "until", "after", "parents", "ids"].flatMap((k) => (queryOf(c, k) === undefined ? [] : [[k, queryOf(c, k)]])));
    const q = eventsQuerySchema.parse(raw);
    let page: ChatEventPage;
    if ("parents" in q) {
      const ids = (q.ids ?? "").split(",").filter(Boolean).map(Number).filter(Number.isInteger);
      const events = scopeEvents(store, chat.id, q.parents.split(",").filter(Boolean), ids, q.before);
      page = { events, has_earlier: false, has_later: false, head_partial: false };
    } else if ("since" in q) page = pageSince(store, chat.id, q.before, q.since);
    else if ("around" in q) page = pageAround(store, chat.id, q.around, q.turns, q.until);
    else if ("after" in q) page = pageAfter(store, chat.id, q.after, q.turns, q.until);
    else page = pageBefore(store, chat.id, q.before, q.turns);
    return c.json(page);
  });

  // チャットの中の検索で読む本文（before より前の自分の発言とメインエージェントの返答だけ。照らし合わせは画面。コアで利用者の正規表現を流さない）
  app.get("/api/chats/:id/texts", withChat, (c) => {
    const { before } = z.object({ before: optionalId.unwrap() }).parse({ before: queryOf(c, "before") });
    const texts: ChatTexts = { events: store.events.mainTexts(c.var.chat.id, before) };
    return c.json(texts);
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
    // 決まりは AI の update_chat・archive_chat と同じ update.ts（子チャットはグループに入らない・子孫ごとしまう・作業中はしまえない）
    const plan = refusedAs(() => planChatUpdate({ store, requireIdle: (id, action) => runner.requireIdle(id, action) }, chat, { title, pinned, groupId: group_id, archived }), HTTP_REFUSALS);
    return c.json(applyChatUpdate(store.chats, plan).chat);
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
   * 別のプロジェクトへ移す（右クリックの「プロジェクトを移動」）。グループ・作業場所（ワークツリー）は元のプロジェクトのものなので外し、
   * 作業場所は移った先の本体にする。会話（Claude Code のセッション）は作業フォルダが変わっても続けられる。作業中は断る。
   * 作業フォルダが変わるので、作業場所を移すのと同じく、会話を新しいセッションに写して区切りを置く（子チャットもそれぞれ）
   */
  app.post("/api/chats/:id/move", withChat, async (c) => {
    const { chat } = c.var;
    const { project_id } = z.object({ project_id: z.number().int().positive() }).parse(await jsonBody(c));
    const target = requireProject(store, project_id);
    if (target.id === chat.project_id) return c.json(chat);
    // 子チャット（子・孫…）も一緒に移す
    const family = descendantsOf(store.chats, chat.id);
    for (const c of [chat, ...family]) runner.requireIdle(c.id, "移動");
    for (const c of family) await runner.moveWorkplace(c.id, { worktreePath: null, projectId: target.id, reason: "project_moved" });
    return c.json(await runner.moveWorkplace(chat.id, { worktreePath: null, projectId: target.id, reason: "project_moved" }));
  });

  // 作業場所を移す（画面の見出しの札・右クリックの「作業場所を変更」）。子チャットは移さない
  const moveDeps = { reservedFolders: () => runner.reservedFolders(), terminals, worktreeEnvs };
  // 移す前の確かめの中身（元の場所に残る変更・そこで動いているターミナル・移す先にできないワークツリー）
  app.get("/api/chats/:id/workplace", withChat, async (c) => {
    const { chat } = c.var;
    return c.json(await workplaceMoveCheck(moveDeps, chat, requireProject(store, chat.project_id)));
  });
  app.post("/api/chats/:id/workplace", withChat, async (c) => {
    const { chat } = c.var;
    const body = z
      .object({ worktree_path: z.string().min(1).nullable(), new_worktree_branch: branchName.optional(), carry: z.boolean().optional() })
      .parse(await jsonBody(c)) satisfies WorkplaceMoveBody;
    runner.requireIdle(chat.id, "作業場所の変更");
    const { input, steps } = await planUserWorkplaceMove(moveDeps, chat, requireProject(store, chat.project_id), body);
    return c.json(await runner.moveWorkplace(chat.id, input, steps));
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
