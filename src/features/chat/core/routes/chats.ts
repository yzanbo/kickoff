import { z } from "zod";
import { requireWorktree } from "@/foundation/core/workplace/worktrees";
import type { ChatRouteDeps } from "./deps";
import { implement } from "@/foundation/core/http/implement";
import { applyChatUpdate, HTTP_REFUSALS, planChatUpdate, refusedAs } from "@/features/chat/core/update";
import { requireProject } from "@/foundation/core/http/lookups";
import { requireGroupOf } from "@/features/groups/core/index";
import { chatTitle, githubLinkSchema, newChatSchema } from "./schemas";
import { flag, optionalId } from "@/foundation/core/http/zodParts";
import { chatTranscript } from "@/features/chat/core/transcript";
import { trashChat } from "@/features/chat/core/sessions/chatTrash";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { chatContract } from "@shared/chat/contract";
import { CHAT_DETAIL_LIMIT_MAX, CHAT_TAIL_MAX_BYTES, type ChatDetail, type ChatDetailQuery, type ChatEventPage, type ChatEventsQuery } from "@shared/chat/detail";
import type { Chat } from "@shared/chat/types";
import { isCommonProject } from "@shared/projects/kinds";
import { READ_TOGGLE_BUSY_NOTE } from "@shared/chat/readTiming";
import { Conflict } from "@/foundation/core/errors";
import { buildIndex, pageAfter, pageAround, pageBefore, pageSince, scopeEvents, tailStart } from "@/features/chat/core/chatLogQuery";

/**
 * チャットの一覧の絞り込み（並びは最後に動いた順）: ?archived=1 でアーカイブ済みだけ（なければアーカイブしていないものだけ）。
 * 件数は ?limit= で絞れるが、省けばすべて返す（黙って切ると、古い作業中のチャットが画面の一覧から落ちる）
 */
const chatListQuery = z.object({ archived: flag.optional(), limit: optionalId });
const chatListFilter = ({ archived, limit }: z.output<typeof chatListQuery>) => ({ limit, onlyArchived: archived === "1" });

/** ターンの数（末尾・ページ） */
const turnsSchema = z.coerce.number().int().min(1).max(200);

/** チャットの詳細の記録の読み方（after と before は一緒に使えない。before には limit が要る。tail_turns はほかと一緒に使えない） */
const detailQuerySchema = z
  .object({ after: optionalId, before: optionalId, limit: z.coerce.number().int().min(1).max(CHAT_DETAIL_LIMIT_MAX).optional(), tail_turns: turnsSchema.optional() })
  .refine((q) => q.after === undefined || (q.before === undefined && q.limit === undefined), "after は before・limit と一緒に使えません")
  .refine((q) => q.before === undefined || q.limit !== undefined, "before には limit が要ります")
  .refine((q) => q.tail_turns === undefined || (q.after === undefined && q.before === undefined && q.limit === undefined), "tail_turns は after・before・limit と一緒に使えません");

/** , 区切りの呼び出し ID・記録の ID */
const csvIds = z.string().min(1).max(20_000);

/** 記録の一部分の読み方（GET /api/chats/:chatId/events。ChatEventsQuery のどれか 1 つの形。余計な組み合わせは 400。知らないクエリは見ない） */
const EVENTS_QUERY_KEYS = ["before", "turns", "since", "around", "until", "after", "parents", "ids"];
const eventsQueryForms = z.union([
  z.object({ before: optionalId.unwrap(), turns: turnsSchema }).strict(),
  z.object({ before: optionalId.unwrap(), since: z.coerce.number().int().min(0) }).strict(),
  z.object({ around: optionalId.unwrap(), turns: turnsSchema, until: optionalId }).strict(),
  z.object({ after: z.coerce.number().int().min(0), turns: turnsSchema, until: optionalId }).strict(),
  z.object({ parents: csvIds, ids: csvIds.optional(), before: optionalId.unwrap() }).strict(),
])
const eventsQuerySchema = z.preprocess((raw) => Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => EVENTS_QUERY_KEYS.includes(k))), eventsQueryForms);

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
  .partial();

/**
 * チャット（エージェントとの会話）の資源: 一覧・始める・詳細・変更（名前・グループ・固定・アーカイブ）・既読・削除・検索（取り決めは @shared/chat/contract.ts の chatContract）。
 * 送る・伝える・止める・巻き戻しは routes/turns.ts（別のプロジェクト・作業場所への移動は workplaceMove、分岐は childChats）。変えたら、変えたあとのチャットを返す
 */
export function chatRoutes({ store, streamingText, runner, approvals, workplace, trashBin, userSent, chatParam, projectParam }: ChatRouteDeps) {
  return implement(chatContract, {
    context: { chatId: chatParam, projectId: projectParam },
    // プロジェクトのチャット（絞り込みは全プロジェクトの一覧と同じ）
    "GET /api/projects/:projectId/chats": { query: chatListQuery, run: ({ projectId: project, query }) => store.chats.list({ ...chatListFilter(query), projectId: project.id }) },
    "POST /api/projects/:projectId/chats": {
      body: newChatSchema,
      run: async ({ projectId: project, body: input, caller }) => {
        // 共通は Git で管理しないフォルダ（作業フォルダ .common-work）なので、ワークツリーのチャットは作れない（ノートの親フォルダが Git の中でも作らせない）
        if (isCommonProject(project) && (input.new_worktree_branch || input.worktree_path)) throw new Conflict("共通は Git で管理しないので、ワークツリーのチャットは作れません");
        if (input.group_id !== undefined) requireGroupOf(store.groups, input.group_id, project.id);
        // 新しいブランチ名があれば、本体のいまのコミットからワークツリーを作る（作る人が実行環境も整える。作れなければ 400）
        const worktreePath = input.new_worktree_branch
          ? (await workplace.creator().createWorktree({ projectId: project.id, repoPath: project.repo_path }, input.new_worktree_branch, project.repo_path)).folder
          : await existingWorktree(project.repo_path, input.worktree_path);
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
        userSent(caller, created.id, input.user_view);
        return created;
      },
    },
    // GitHub の issue・PR を結び付ける・外す（並び順は変えない）
    "PUT /api/chats/:chatId/github": { body: githubLinkSchema, run: ({ chatId: chat, body }) => store.chats.setGitHub(chat.id, body) },
    "DELETE /api/chats/:chatId/github": { run: ({ chatId: chat }) => store.chats.setGitHub(chat.id, null) },
    // 手動の並び（サイドバーの並び順「手動順」）を ids の順にする。並べたチャットを並びの順に返す
    "PUT /api/projects/:projectId/chats/order": { body: z.object({ ids: z.array(z.number().int()) }), run: ({ projectId: project, body }) => store.chats.reorder(project.id, body.ids) },
    // チャットのやり取りのキーワード検索（⌘F）
    "GET /api/search": {
      query: z.object({ q: z.string().max(1000).default(""), project_id: optionalId, chat_id: optionalId, limit: optionalId }),
      run: ({ query: { q, project_id, chat_id, limit } }) => store.events.search(q, { projectId: project_id, chatId: chat_id, limit }),
    },
    // フィード（全プロジェクトの画面）: チャットごとのメインエージェントの最新の返答 1 件。返答の新しい順
    "GET /api/feed": { query: z.object({ limit: optionalId }), run: ({ query }) => store.events.feed(query.limit) },
    // 全プロジェクトのチャット（画面はこれを 1 回読み、あとは知らせで直す）
    "GET /api/chats": { query: chatListQuery, run: ({ query }) => store.chats.list(chatListFilter(query)) },
    // チャットの詳細（作業中の様子 live は SSE の chat_live と同じ形。画面はそれで追いかける）。
    // 記録はクエリで絞れる（ChatDetail の説明。つなぎ直したときは after、スマホは limit と before で少しずつ）
    "GET /api/chats/:chatId": { query: detailQuerySchema, run: ({ chatId: chat, query }) => chatDetail({ store, streamingText, runner, approvals }, chat, query) },
    // 記録の一部分（パソコンの画面が末尾の前を読み足す・遠い所の前後を読む・サブエージェントの中を読む。ChatEventsQuery）
    "GET /api/chats/:chatId/events": { query: eventsQuerySchema, run: ({ chatId: chat, query }) => eventPage(store, chat.id, query) },
    // チャットの中の検索で読む本文（before より前の自分の発言とメインエージェントの返答だけ。照らし合わせは画面。コアで利用者の正規表現を流さない）
    "GET /api/chats/:chatId/texts": { query: z.object({ before: optionalId.unwrap() }), run: ({ chatId: chat, query }) => ({ events: store.events.mainTexts(chat.id, query.before) }) },
    // チャットのやり取りの記録（Markdown。右クリックの「全部のやり取りをコピー」。画面が描いている範囲に関係なく、初めからすべて）
    "GET /api/chats/:chatId/transcript": { run: ({ chatId: chat }) => ({ markdown: chatTranscript(chat, requireProject(store, chat.project_id), store.events.list(chat.id), { note: false }) }) },
    // チャットの名前・グループ・固定・アーカイブを変える（カンバンの列は AI の状態で決まるので変えない）。
    // 確かめ（ほかのプロジェクトのグループ・作業中のアーカイブ）を先にすべて済ませてから変える（途中まで変えて断らない）
    "PATCH /api/chats/:chatId": {
      body: chatPatchSchema,
      run: ({ chatId: chat, body: { title, group_id, pinned, archived } }) => {
        // 決まりは AI の update_chat・archive_chat と同じ update.ts（子チャットはグループに入らない・子孫ごとしまう・作業中はしまえない）
        const plan = refusedAs(() => planChatUpdate({ store, requireIdle: (id, action) => runner.requireIdle(id, action) }, chat, { title, pinned, groupId: group_id, archived }), HTTP_REFUSALS);
        return applyChatUpdate(store.chats, plan).chat;
      },
    },
    // 確認した（未読を消す）。event_id = 画面で一番下まで見た記録。それより新しい返答が届いていれば、まだ見ていないので消さない
    // （event_id がなければ、メニューの「既読にする」などで、そのまま消す）
    "POST /api/chats/:chatId/seen": {
      body: z.object({ event_id: z.number().int().optional() }),
      run: ({ chatId: chat, body: { event_id } }) => (!chat.unread || (event_id !== undefined && store.events.latestUnreadId(chat.id) > event_id) ? chat : store.chats.setUnread(chat.id, false)),
    },
    // 未読にする（未読に戻す。次に開くまで残る）。未読は作業が終わってからだけの状態なので、作業中・回答待ちは断る
    // （作業中に付けると作業中の印に未読の点が重なり、作業中に届いた返答の知らせと見分けられない）
    "POST /api/chats/:chatId/unseen": {
      run: ({ chatId: chat }) => {
        if (runner.isBusy(chat.id) || approvals.list({ chatId: chat.id }).length > 0) throw new Conflict(READ_TOGGLE_BUSY_NOTE);
        return chat.unread ? chat : store.chats.setUnread(chat.id, true);
      },
    },
    "GET /api/chat-settings": { run: () => ({ read_timing: store.settings.get().read_timing }) },
    // 削除 = Kickoff のゴミ箱へ（子チャット（子・孫…）・会話の記録・会話記録のファイル・添付ごと。3 日は戻せ、3 日たったら本当に消す。
    // 作業中のものがあれば消せない）。入れたゴミ箱の ID を返す（画面の「元に戻す」）
    "DELETE /api/chats/:chatId": { run: ({ chatId: chat }) => ({ trash_id: trashChat({ store, trashBin, runner }, chat).id }) },
  });
}

/** チャットの詳細（記録の読み方は ChatDetailQuery。末尾をターンで読むときは、その前を索引で返す） */
function chatDetail({ store, streamingText, runner, approvals }: Pick<ChatRouteDeps, "store" | "streamingText" | "runner" | "approvals">, chat: Chat, { after, before, limit, tail_turns }: ChatDetailQuery): ChatDetail {
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
  return { chat, events, has_earlier: hasEarlier, after_missing: afterMissing, approvals: approvalList, live, streaming_text: streaming, streaming_length: streaming?.length ?? 0, ...tail };
}

/** 記録の一部分（ChatEventsQuery の 5 つの形） */
function eventPage(store: ChatRouteDeps["store"], chatId: number, q: ChatEventsQuery): ChatEventPage {
  if ("parents" in q) {
    const ids = (q.ids ?? "").split(",").filter(Boolean).map(Number).filter(Number.isInteger);
    return { events: scopeEvents(store, chatId, q.parents.split(",").filter(Boolean), ids, q.before), has_earlier: false, has_later: false, head_partial: false };
  }
  if ("since" in q) return pageSince(store, chatId, q.before, q.since);
  if ("around" in q) return pageAround(store, chatId, q.around, q.turns, q.until);
  if ("after" in q) return pageAfter(store, chatId, q.after, q.turns, q.until);
  return pageBefore(store, chatId, q.before, q.turns);
}

/** チャットの作業場所（DB に入れる worktree_path）: フォルダの指定があればこのプロジェクトのワークツリーか確かめる（requireWorktree）。本体は空 */
async function existingWorktree(repo: string, worktreePath?: string): Promise<string> {
  const found = await requireWorktree(repo, worktreePath);
  return found && !found.main ? found.path : "";
}
