import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { ChatEvent, ChatEventData, ChatEventDataOf, ChatEventType } from "@shared/chat/chatEvent";
import { FEED_TEXT_LIMIT, type Chat, type FeedItem, type SearchHit } from "@shared/chat/types";
import type { ChatEventMeta } from "@shared/chat/chatIndex";
import type { Notify, Row } from "@/foundation/core/db/common";
import type { LogRevisions } from "./logRevisions";

interface EventRow {
  id: number;
  chat_id: number;
  type: ChatEvent["type"];
  data: string;
  created_at: string;
}

interface MetaRow {
  id: number;
  type: ChatEvent["type"];
  call_id: unknown;
  name: unknown;
  parent: unknown;
  tool_use_id: unknown;
  task_id: unknown;
  status: unknown;
  size: number;
}

/** 記録の軽い形と大きさ（data の長さ） */
export interface EventMetaRow {
  meta: ChatEventMeta;
  size: number;
}

const textOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** 添付の ID（uuid）の形 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** 記録の列（生成列 text は検索だけに使うので、読み出す形には入れない） */
const EVENT_COLUMNS = "id, chat_id, type, data, created_at";

const toEvent = (row: EventRow): ChatEvent => ({ ...row, data: JSON.parse(row.data) as ChatEventData }) as ChatEvent;

/** キーワードの前後を切り出す（前 40 文字・後ろ 80 文字程度） */
function snippetAround(text: string, keyword: string): { snippet: string; match_start: number; match_end: number } {
  const flat = text.replace(/\s+/g, " ");
  const index = flat.toLowerCase().indexOf(keyword.toLowerCase());
  if (index < 0) return { snippet: flat.slice(0, 120), match_start: 0, match_end: 0 };
  const start = Math.max(0, index - 40);
  const end = Math.min(flat.length, index + keyword.length + 80);
  const prefix = start > 0 ? "…" : "";
  const snippet = `${prefix}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
  const matchStart = prefix.length + index - start;
  return { snippet, match_start: matchStart, match_end: matchStart + keyword.length };
}

/**
 * キーワードの探し方。3 文字（コードポイント）以上は全文検索の索引（trigram）で部分一致を探す（" は 2 つに。% _ はそのまま）。
 * 2 文字以下は trigram の索引が使えないので、生成列 text を LIKE で探す（% _ \ は文字として探す。大文字・小文字は ASCII だけ区別しない）
 */
function keywordMatch(keyword: string): { from: string; where: string[]; params: Row } {
  if ([...keyword].length >= 3) {
    return {
      from: "chat_event_search s JOIN chat_events e ON e.id = s.rowid",
      where: ["chat_event_search MATCH $match"],
      params: { match: `"${keyword.replaceAll('"', '""')}"` },
    };
  }
  const pattern = `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return { from: "chat_events e", where: ["e.text LIKE $pattern ESCAPE '\\'"], params: { pattern } };
}

/** id の範囲（組み合わせると重なり） */
interface IdRange {
  /** id がこれより大きい */
  after?: number;
  /** id がこれより小さい */
  before?: number;
  /** id がこれ以上 */
  from?: number;
  /** id がこれ未満 */
  to?: number;
}

/** 記録の読み方（list の選択肢） */
export interface EventListQuery extends IdRange {
  /** 件数の上限（desc なら新しいほうから） */
  limit?: number;
  /** 新しい順に返す */
  desc?: boolean;
  types?: readonly ChatEventType[];
  /** この ID の記録だけ */
  ids?: readonly number[];
  /** サブエージェントの記録（parent のあるもの）を外す */
  mainOnly?: boolean;
  /** ツールの呼び出しの引数（書き込む中身など大きいことがある）を読まずに空にする */
  light?: boolean;
}

/** いちばん新しい記録の ID を探す条件（type と mainText を両方書くと、どちらかに当たるもの） */
interface LatestIdQuery {
  type?: ChatEventType | readonly ChatEventType[];
  /** メインエージェントの返答（parent のない text） */
  mainText?: boolean;
  /** 圧縮前指示（札付きの自分の発言） */
  preCompact?: true;
  before?: number;
}

/** 記録があるかを見る条件 */
interface ExistsQuery extends IdRange {
  id?: number;
  type?: ChatEventType;
  /** 結果の文にこの文字を含む、失敗でないツールの結果（tool_result） */
  toolResultContains?: string;
}

/** 組み立て中の WHERE（条件と、その順の値） */
interface Where {
  conds: string[];
  params: SQLInputValue[];
}

/** サブエージェントでない（式は覆う索引 idx_chat_events_meta と同じ書き方にする。違うと索引を使わずに全行の JSON を解く） */
const MAIN_ONLY = "json_extract(data, '$.parent') IS NULL";

/** ツールの呼び出しは名前と ID だけにする（引数は空のオブジェクト） */
const LIGHT_DATA = `CASE WHEN type = 'tool_use'
  THEN json_patch(json_object('id', json_extract(data, '$.id'), 'name', json_extract(data, '$.name'), 'input', json('{}')), json_object('parent', json_extract(data, '$.parent')))
  ELSE data END`;

/** そのチャットの、id の範囲の条件 */
function rangeWhere(chatId: number, q: IdRange & { id?: number }): Where {
  const where: Where = { conds: ["chat_id = ?"], params: [chatId] };
  for (const [cond, value] of [["id = ?", q.id], ["id > ?", q.after], ["id < ?", q.before], ["id >= ?", q.from], ["id < ?", q.to]] as const) {
    if (value !== undefined) where.conds.push(cond), where.params.push(value);
  }
  return where;
}

/** 種類の一覧の条件（値は where に足す） */
function typeIn(where: Where, types: readonly ChatEventType[]): string {
  where.params.push(...types);
  return `type IN (${types.map(() => "?").join(", ")})`;
}

/** チャットの記録（chat_events の表）と、やり取りの全文検索。getChat は、知らせにプロジェクトを添えるのに使う */
export function createEventStore(db: DatabaseSync, onChange: Notify, getChat: (id: number) => Chat | undefined, revisions?: LogRevisions) {
  const readRows = (sql: string, params: SQLInputValue[]) => (db.prepare(sql).all(...params) as unknown as EventRow[]).map(toEvent);

  /** 記録を読む（既定は古い順ですべて）。読み方は list・latestId・exists・latestResult に集め、名前の付いた読み取りはこれらを呼ぶ */
  function list(chatId: number, q: EventListQuery = {}): ChatEvent[] {
    if (!q.ids) return readList(chatId, q);
    // 引数の数の上限を超えないよう、分けて読む
    const out: ChatEvent[] = [];
    for (let i = 0; i < q.ids.length; i += 500) out.push(...readList(chatId, q, q.ids.slice(i, i + 500)));
    return out.sort((a, b) => (q.desc ? b.id - a.id : a.id - b.id)).slice(0, q.limit);
  }

  function readList(chatId: number, q: EventListQuery, ids?: readonly number[]): ChatEvent[] {
    const where = rangeWhere(chatId, q);
    if (ids) {
      where.conds.push(`id IN (${ids.map(() => "?").join(",")})`);
      where.params.push(...ids);
    }
    if (q.types) where.conds.push(typeIn(where, q.types));
    if (q.mainOnly) where.conds.push(MAIN_ONLY);
    if (q.limit !== undefined) where.params.push(q.limit);
    // サブエージェントを外すときは、種類と parent を覆う索引で絞ってから行を読む（生成列 text は VIRTUAL なので、text で探すと全行の JSON を解く）
    return readRows(
      `SELECT id, chat_id, type, ${q.light ? LIGHT_DATA : "data"} AS data, created_at FROM chat_events${q.mainOnly ? " INDEXED BY idx_chat_events_meta" : ""}
       WHERE ${where.conds.join(" AND ")} ORDER BY id${q.desc ? " DESC" : ""}${q.limit !== undefined ? " LIMIT ?" : ""}`,
      where.params,
    );
  }

  /** いちばん新しい記録の ID（なければ null。覆う索引だけを読む） */
  function latestId(chatId: number, q: LatestIdQuery = {}): number | null {
    const where = rangeWhere(chatId, { before: q.before });
    const either: string[] = [];
    if (q.type !== undefined) either.push(typeIn(where, typeof q.type === "string" ? [q.type] : q.type));
    if (q.mainText) either.push(`(type = 'text' AND ${MAIN_ONLY})`);
    if (either.length > 0) where.conds.push(`(${either.join(" OR ")})`);
    if (q.preCompact) where.conds.push("json_extract(data, '$.pre_compact') = 1");
    const row = db.prepare(`SELECT MAX(id) AS id FROM chat_events INDEXED BY idx_chat_events_meta WHERE ${where.conds.join(" AND ")}`).get(...where.params) as { id: number | null };
    return row.id;
  }

  /** 条件に当たる記録があるか（巻き戻しで消えた ID は false。記録の ID は使い回さない） */
  function exists(chatId: number, q: ExistsQuery): boolean {
    const where = rangeWhere(chatId, q);
    if (q.type !== undefined) {
      where.conds.push("type = ?");
      where.params.push(q.type);
    }
    if (q.toolResultContains !== undefined) {
      where.conds.push("type = 'tool_result' AND json_extract(data, '$.is_error') = 0 AND instr(json_extract(data, '$.content'), ?) > 0");
      where.params.push(q.toolResultContains);
    }
    return db.prepare(`SELECT 1 FROM chat_events WHERE ${where.conds.join(" AND ")} LIMIT 1`).get(...where.params) !== undefined;
  }

  /** いちばん新しい作業の終わり（result。なければ null）。withSession = セッションの ID を持つものだけ */
  function latestResult(chatId: number, q: { withSession?: boolean; before?: number } = {}): ChatEvent | null {
    const where = rangeWhere(chatId, { before: q.before });
    where.conds.push("type = 'result'");
    if (q.withSession) where.conds.push("json_extract(data, '$.session_id') IS NOT NULL");
    return readRows(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE ${where.conds.join(" AND ")} ORDER BY id DESC LIMIT 1`, where.params)[0] ?? null;
  }

  return {
    add(chatId: number, event: ChatEventData): ChatEvent {
      const { type, ...data } = event;
      const { lastInsertRowid } = db.prepare("INSERT INTO chat_events (chat_id, type, data) VALUES (?, ?, ?)").run(chatId, type, JSON.stringify(data));
      const saved = toEvent(db.prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE id = ?`).get(Number(lastInsertRowid)) as unknown as EventRow);
      const chat = getChat(chatId);
      if (chat) onChange({ type: "chat_event", project_id: chat.project_id, event: saved });
      return saved;
    },
    /** 記録を 1 件（なければ null） */
    get(eventId: number): ChatEvent | null {
      const row = db.prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE id = ?`).get(eventId) as unknown as EventRow | undefined;
      return row ? toEvent(row) : null;
    },
    list,
    latestId,
    exists,
    latestResult,
    /** 新しいほうから limit 件（新しい順） */
    recent: (chatId: number, limit: number) => list(chatId, { desc: true, limit }),
    /** afterId より新しい記録（古い順。つなぎ直したときに、切れていた間の分だけ読む） */
    after: (chatId: number, afterId: number) => list(chatId, { after: afterId }),
    /** beforeId より前の記録を新しいほうから limit 件（古い順で返す。null なら終わりから。さかのぼって読む） */
    before: (chatId: number, beforeId: number | null, limit: number) => list(chatId, { before: beforeId ?? undefined, desc: true, limit }).reverse(),
    /** id が from 以上 to 未満の記録（古い順） */
    range: (chatId: number, from: number, to: number) => list(chatId, { from, to }),
    /** ID を選んだ記録（古い順。索引に入れる行だけを読む） */
    byIds: (chatId: number, ids: readonly number[]) => list(chatId, { ids }),
    /**
     * id が from 以上 to 未満の記録の軽い形（ChatEventMeta）と大きさ（data の長さ）。覆う索引 idx_chat_events_meta（v30）だけを読み、data の JSON を解かない
     * （式は索引と同じ書き方にする。違うと索引を使わずに全行の JSON を解く）
     */
    metas(chatId: number, from: number, to: number): EventMetaRow[] {
      const rows = db
        .prepare(
          `SELECT id, type, json_extract(data, '$.id') AS call_id, json_extract(data, '$.name') AS name, json_extract(data, '$.parent') AS parent,
             json_extract(data, '$.tool_use_id') AS tool_use_id, json_extract(data, '$.task_id') AS task_id, json_extract(data, '$.status') AS status,
             length(data) AS size
           FROM chat_events INDEXED BY idx_chat_events_meta WHERE chat_id = ? AND id >= ? AND id < ? ORDER BY id`,
        )
        .all(chatId, from, to) as unknown as MetaRow[];
      return rows.map((r) => ({
        meta: { id: r.id, type: r.type, callId: textOrNull(r.call_id), name: textOrNull(r.name), parent: textOrNull(r.parent), toolUseId: textOrNull(r.tool_use_id), taskId: textOrNull(r.task_id), status: textOrNull(r.status) },
        size: r.size,
      }));
    },
    /** 作業の終わり（result）の記録の ID を、before より前から新しい順に limit 件 */
    resultIdsBefore(chatId: number, before: number, limit: number): number[] {
      const rows = db
        .prepare("SELECT id FROM chat_events INDEXED BY idx_chat_events_meta WHERE chat_id = ? AND id < ? AND type = 'result' ORDER BY id DESC LIMIT ?")
        .all(chatId, before, limit) as { id: number }[];
      return rows.map((r) => r.id);
    },
    /** 作業の終わり（result）の記録の ID を、from 以上（to 未満）から古い順に limit 件 */
    resultIdsFrom(chatId: number, from: number, to: number, limit: number): number[] {
      const rows = db
        .prepare("SELECT id FROM chat_events INDEXED BY idx_chat_events_meta WHERE chat_id = ? AND id >= ? AND id < ? AND type = 'result' ORDER BY id LIMIT ?")
        .all(chatId, from, to, limit) as { id: number }[];
      return rows.map((r) => r.id);
    },
    /** いちばん新しいメインエージェントの返答（parent のない text）の記録の ID（なければ null） */
    latestMainTextId: (chatId: number) => latestId(chatId, { mainText: true }),
    /** すべてのチャットの記録で、いちばん大きい ID（なければ 0。これから足す記録の ID はこれより大きい） */
    maxId(): number {
      const row = db.prepare("SELECT MAX(id) AS id FROM chat_events").get() as { id: number | null };
      return row.id ?? 0;
    },
    /** そのチャットの、from 以上 to 未満に記録があるか */
    hasBetween: (chatId: number, from: number, to: number) => exists(chatId, { from, to }),
    /** チャットの中の検索で読む本文: before より前の、自分の発言（user）とメインエージェントの返答（parent のない text）だけ（古い順） */
    mainTexts: (chatId: number, before: number) => list(chatId, { before, types: ["user", "text"], mainOnly: true }),
    /** そのチャットの、id より前の記録があるか */
    hasBefore: (chatId: number, id: number) => exists(chatId, { before: id }),
    /** そのチャットの記録か（巻き戻しで消えていれば false） */
    has: (chatId: number, id: number) => exists(chatId, { id }),
    /** そのチャットに、結果の文に text を含む失敗でないツールの結果があるか（AI が描いた図の ID を確かめる。`@shared/chat/aiVisual` の visualIdLine） */
    hasToolResultWith: (chatId: number, text: string) => exists(chatId, { toolResultContains: text }),
    /**
     * 会話を読む分の記録（自分の発言・AI の文・失敗・ツールの呼び出し）。AI がほかのチャットの会話を読むツール（read_chat）が使う。
     * ツールの呼び出しは数えるだけなので、引数は読まずに空にする
     */
    conversation: (chatId: number) => list(chatId, { types: ["user", "text", "error", "tool_use"], light: true }),
    /** いちばん新しい自分の発言（user）の記録の id（なければ null） */
    latestUserId: (chatId: number) => latestId(chatId, { type: "user" }),
    /** いちばん新しい作業の終わり（result）の記録の id（なければ null） */
    latestResultId: (chatId: number) => latestId(chatId, { type: "result" }),
    /** 未読にする「新しい結果」（shared/chat/state.ts の isUnreadEvent と同じもの）のうち、いちばん新しい記録の id（なければ 0） */
    latestUnreadId: (chatId: number) => latestId(chatId, { type: ["result", "error"], mainText: true }) ?? 0,
    /** 記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用。1 件ずつは知らせない） */
    copy(fromChatId: number, toChatId: number, upToEventId: number): void {
      db.prepare(
        "INSERT INTO chat_events (chat_id, type, data, created_at) SELECT ?, type, data, created_at FROM chat_events WHERE chat_id = ? AND id <= ? ORDER BY id",
      ).run(toChatId, fromChatId, upToEventId);
    },
    /** AI 別にセッションを片付けるための最小の記録。切り替えの順序とセッション ID だけを読む。 */
    sessionRecords: (chatId: number) => list(chatId, { types: ["init", "result", "workplace_moved", "provider_switched"] }),
    /**
     * チャットの記録が指している添付の ID の候補（自分の発言・質問への回答の中の uuid。添付の保存先のフォルダ名と同じ形。
     * 添付でない uuid も混ざるので、使う側が保存先にあるかで見分ける）
     */
    uploadIdsIn(chatIds: number[]): Set<string> {
      const ids = new Set<string>();
      if (chatIds.length === 0) return ids;
      const rows = db
        .prepare(`SELECT data FROM chat_events WHERE chat_id IN (${chatIds.map(() => "?").join(",")}) AND type IN ('user', 'approval_resolved', 'provider_switched')`)
        .all(...chatIds) as { data: string }[];
      for (const { data } of rows) for (const m of data.matchAll(UUID_PATTERN)) ids.add(m[0]);
      return ids;
    },
    /** その添付をどれかのチャットの記録（自分の発言・質問への回答）か送信待ち・預かりが使っているか（ゴミ箱にあるチャットも数える） */
    uploadInUse(uploadId: string): boolean {
      return (
        db
          .prepare(
            `SELECT 1 FROM chat_events WHERE type IN ('user', 'approval_resolved', 'provider_switched') AND instr(data, $id) > 0
             UNION ALL SELECT 1 FROM chat_outbox WHERE instr(now, $id) > 0 OR instr(later, $id) > 0 LIMIT 1`,
          )
          .get({ id: uploadId }) !== undefined
      );
    },
    /** いまあるチャット（ゴミ箱のものも）が使っているセッションの ID すべて（チャットの session_id・AI ごとのセッション・記録の init・result・workplace_moved） */
    usedSessionIds(): Set<string> {
      const rows = db
        .prepare(
          `SELECT session_id AS sid FROM chats WHERE session_id IS NOT NULL
           UNION SELECT session_id FROM chat_provider_sessions
           UNION SELECT json_extract(data, '$.session_id') FROM chat_events WHERE type IN ('init', 'result', 'workplace_moved') AND json_extract(data, '$.session_id') IS NOT NULL`,
        )
        .all() as { sid: string }[];
      return new Set(rows.map((r) => r.sid));
    },
    /** このセッション ID を、いまあるチャットのどれかが使っているか（usedSessionIds と同じ所を見る） */
    sessionInUse(sessionId: string): boolean {
      return Boolean(
        db
          .prepare(
            `SELECT 1 FROM chats WHERE session_id = $sid
             UNION ALL SELECT 1 FROM chat_provider_sessions WHERE session_id = $sid
             UNION ALL SELECT 1 FROM chat_events WHERE type IN ('init', 'result', 'workplace_moved') AND json_extract(data, '$.session_id') = $sid LIMIT 1`,
          )
          .get({ sid: sessionId }),
      );
    },
    /**
     * 移したあとまだ AI に知らせていない、作業場所を移した区切りの中身（いちばん新しい区切りのあとに作業の終わり result がない。なければ null）。
     * 移したあと最初に送るものに 1 回だけ移動の知らせを添えるため
     */
    pendingWorkplaceMove(chatId: number): ChatEventDataOf<"workplace_moved"> | null {
      const row = db
        .prepare(
          `SELECT m.data AS data FROM chat_events m WHERE m.chat_id = $chat AND m.type = 'workplace_moved'
             AND NOT EXISTS (SELECT 1 FROM chat_events r WHERE r.chat_id = $chat AND r.type = 'result' AND r.id > m.id)
           ORDER BY m.id DESC LIMIT 1`,
        )
        .get({ chat: chatId }) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as ChatEventDataOf<"workplace_moved">) : null;
    },
    /** 作業場所を移した区切り（古い順。ID と中身。区切りより前の発言の画像・ファイルを、そのときの作業場所から読むため） */
    workplaceMoves: (chatId: number) => list(chatId, { types: ["workplace_moved"] }).flatMap((e) => (e.type === "workplace_moved" ? [{ id: e.id, data: e.data }] : [])),
    /**
     * このチャットの記録の init・result が指すセッション from を to に付け替える（長いチャットを直近の区切りだけの新しいセッションに乗り換えたとき。
     * 発言の ID は新しいセッションでも同じなので、残した区切りの中の起点からは分岐・巻き戻しができる）
     */
    remapSession(chatId: number, from: string, to: string): void {
      db.prepare(
        `UPDATE chat_events SET data = json_set(data, '$.session_id', ?)
         WHERE chat_id = ? AND type IN ('init', 'result', 'workplace_moved') AND json_extract(data, '$.session_id') = ?`,
      ).run(to, chatId, from);
      revisions?.changed(chatId);
    },
    /** 記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用。全文検索の索引はトリガーで追従する） */
    deleteFrom(chatId: number, fromEventId: number): void {
      db.prepare("DELETE FROM chat_events WHERE chat_id = ? AND id >= ?").run(chatId, fromEventId);
      revisions?.changed(chatId);
      const chat = getChat(chatId);
      if (chat) onChange({ type: "chat_events_deleted", project_id: chat.project_id, chat_id: chatId, from_event_id: fromEventId });
    },
    /**
     * フィード: チャット（子チャット・ノートのチャットを除く）ごとに、メインエージェントの最新の返答 1 件の初めの部分。返答の新しい順。
     * チャットごとに記録の索引（chat_id, id）を新しい方からたどって最初の返答を引く（返答はたいてい終わりの近くにあるので、記録の多いチャットでも速い）
     */
    feed(limit = 100): FeedItem[] {
      const rows = db
        .prepare(
          `SELECT c.id AS chat_id, e.id AS event_id, e.text, e.created_at
           FROM chats c
           JOIN chat_events e ON e.id = (
             SELECT x.id FROM chat_events x
             WHERE x.chat_id = c.id AND x.type = 'text' AND json_extract(x.data, '$.parent') IS NULL
             ORDER BY x.id DESC LIMIT 1
           )
           WHERE c.parent_chat_id IS NULL AND c.note_path IS NULL AND c.trashed_at IS NULL
           ORDER BY e.id DESC LIMIT ?`,
        )
        .all(Math.min(limit, 500)) as unknown as (FeedItem & { text: string | null })[];
      return rows.map((row) => {
        const text = (row.text ?? "").trim();
        return { ...row, text: text.length > FEED_TEXT_LIMIT ? `${text.slice(0, FEED_TEXT_LIMIT)}…` : text };
      });
    },
    /** やり取り（自分の発言とメインの AI の返答）をキーワードで探す（部分一致・大文字と小文字を区別しない）。新しい順 */
    search(query: string, filter: { projectId?: number; chatId?: number; limit?: number } = {}): SearchHit[] {
      const keyword = query.trim();
      if (!keyword) return [];
      const { from, where, params } = keywordMatch(keyword);
      if (filter.projectId !== undefined) {
        where.push("c.project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.chatId !== undefined) {
        where.push("e.chat_id = $chat_id");
        params.chat_id = filter.chatId;
      }
      const rows = db
        .prepare(
          `SELECT e.id AS event_id, e.chat_id, c.project_id, c.title AS chat_title, e.type, e.text, e.created_at
           FROM ${from} JOIN chats c ON c.id = e.chat_id
           WHERE c.trashed_at IS NULL AND ${where.join(" AND ")}
           ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
        )
        .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
      return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
    },
  };
}
