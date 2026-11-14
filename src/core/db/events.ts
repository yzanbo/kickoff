import type { DatabaseSync } from "node:sqlite";
import { FEED_TEXT_LIMIT, type Chat, type ChatEvent, type ChatEventData, type FeedItem, type SearchHit } from "@shared/types";
import { normalizeAttachment } from "@shared/attachment/normalize";
import type { Notify, Row } from "./common.js";

interface EventRow {
  id: number;
  chat_id: number;
  type: ChatEvent["type"];
  data: string;
  created_at: string;
}

/** 添付の ID（uuid）の形 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** 記録の列（生成列 text は検索だけに使うので、読み出す形には入れない） */
const EVENT_COLUMNS = "id, chat_id, type, data, created_at";

const toEvent = (row: EventRow): ChatEvent => ({ ...row, data: withNormalizedAttachments(JSON.parse(row.data) as ChatEventData) }) as ChatEvent;

/** 記録の添付（自分の発言・質問への回答）を今の形にする（種類を持つ前の記録は、読むときに読み替える） */
function withNormalizedAttachments(data: ChatEventData): ChatEventData {
  if (data.type === "user" && data.attachments) return { ...data, attachments: data.attachments.map(normalizeAttachment) };
  if (data.type === "approval_resolved" && data.action === "answer" && data.attachments) {
    return { ...data, attachments: Object.fromEntries(Object.entries(data.attachments).map(([q, list]) => [q, list.map(normalizeAttachment)])) };
  }
  return data;
}

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

/** チャットの記録（chat_events の表）と、やり取りの全文検索。getChat は、知らせにプロジェクトを添えるのに使う */
export function createEventStore(db: DatabaseSync, onChange: Notify, getChat: (id: number) => Chat | undefined) {
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
    /** 新しいほうから limit 件（新しい順） */
    recent(chatId: number, limit: number): ChatEvent[] {
      return (db.prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE chat_id = ? ORDER BY id DESC LIMIT ?`).all(chatId, limit) as unknown as EventRow[]).map(toEvent);
    },
    list(chatId: number): ChatEvent[] {
      return (db.prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE chat_id = ? ORDER BY id`).all(chatId) as unknown as EventRow[]).map(toEvent);
    },
    /** afterId より新しい記録（古い順。つなぎ直したときに、切れていた間の分だけ読む） */
    after(chatId: number, afterId: number): ChatEvent[] {
      return (db.prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE chat_id = ? AND id > ? ORDER BY id`).all(chatId, afterId) as unknown as EventRow[]).map(toEvent);
    },
    /** beforeId より前の記録を新しいほうから limit 件（古い順で返す。null なら終わりから。さかのぼって読む） */
    before(chatId: number, beforeId: number | null, limit: number): ChatEvent[] {
      const rows = db
        .prepare(`SELECT ${EVENT_COLUMNS} FROM chat_events WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?`)
        .all(chatId, beforeId ?? Number.MAX_SAFE_INTEGER, limit) as unknown as EventRow[];
      return rows.reverse().map(toEvent);
    },
    /** そのチャットの、id より前の記録があるか */
    hasBefore(chatId: number, id: number): boolean {
      return db.prepare("SELECT 1 FROM chat_events WHERE chat_id = ? AND id < ? LIMIT 1").get(chatId, id) !== undefined;
    },
    /** そのチャットの記録か（巻き戻しで消えていれば false。記録の ID は使い回さない） */
    has(chatId: number, id: number): boolean {
      return db.prepare("SELECT 1 FROM chat_events WHERE chat_id = ? AND id = ?").get(chatId, id) !== undefined;
    },
    /** そのチャットに、結果の文に text を含む失敗でないツールの結果があるか（AI が描いた図の ID を確かめる。`@shared/chat/aiVisual` の visualIdLine） */
    hasToolResultWith(chatId: number, text: string): boolean {
      return (
        db
          .prepare(
            "SELECT 1 FROM chat_events WHERE chat_id = ? AND type = 'tool_result' AND json_extract(data, '$.is_error') = 0 AND instr(json_extract(data, '$.content'), ?) > 0 LIMIT 1",
          )
          .get(chatId, text) !== undefined
      );
    },
    /**
     * 会話を読む分の記録（自分の発言・AI の文・失敗・ツールの呼び出し）。AI がほかのチャットの会話を読むツール（read_chat）が使う。
     * ツールの呼び出しは数えるだけなので、引数（書き込む中身など大きいことがある）は読まずに空にする
     */
    conversation(chatId: number): ChatEvent[] {
      return (
        db
          .prepare(
            `SELECT id, chat_id, type,
               CASE WHEN type = 'tool_use'
                 THEN json_patch(json_object('id', json_extract(data, '$.id'), 'name', json_extract(data, '$.name'), 'input', json('{}')), json_object('parent', json_extract(data, '$.parent')))
                 ELSE data END AS data,
               created_at
             FROM chat_events WHERE chat_id = ? AND type IN ('user', 'text', 'error', 'tool_use') ORDER BY id`,
          )
          .all(chatId) as unknown as EventRow[]
      ).map(toEvent);
    },
    /** いちばん新しい自分の発言（user）の記録の id（なければ null） */
    latestUserId(chatId: number): number | null {
      const row = db.prepare("SELECT MAX(id) AS id FROM chat_events WHERE chat_id = ? AND type = 'user'").get(chatId) as { id: number | null };
      return row.id;
    },
    /** 未読にする「新しい結果」（shared/chat/state.ts の isUnreadEvent と同じもの）のうち、いちばん新しい記録の id（なければ 0） */
    latestUnreadId(chatId: number): number {
      const row = db
        .prepare(
          "SELECT MAX(id) AS id FROM chat_events WHERE chat_id = ? AND ((type = 'text' AND json_extract(data, '$.parent') IS NULL) OR type IN ('result', 'error'))",
        )
        .get(chatId) as { id: number | null };
      return row.id ?? 0;
    },
    /** 記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用。1 件ずつは知らせない） */
    copy(fromChatId: number, toChatId: number, upToEventId: number): void {
      db.prepare(
        "INSERT INTO chat_events (chat_id, type, data, created_at) SELECT ?, type, data, created_at FROM chat_events WHERE chat_id = ? AND id <= ? ORDER BY id",
      ).run(toChatId, fromChatId, upToEventId);
    },
    /** チャットの記録に出てくる Claude Code などのセッション ID（動かし始めの init と作業の終わり result。分岐で写した記録の分も含む） */
    sessionIds(chatIds: number[]): string[] {
      if (chatIds.length === 0) return [];
      const rows = db
        .prepare(
          `SELECT DISTINCT json_extract(data, '$.session_id') AS sid FROM chat_events
           WHERE chat_id IN (${chatIds.map(() => "?").join(", ")}) AND type IN ('init', 'result') AND json_extract(data, '$.session_id') IS NOT NULL`,
        )
        .all(...chatIds) as { sid: string }[];
      return rows.map((r) => r.sid);
    },
    /** このセッション ID を、いまあるチャットのどれかが使っているか（チャットの session_id か、記録の init・result） */
    /**
     * チャットの記録が指している添付の ID の候補（自分の発言・質問への回答の中の uuid。添付の保存先のフォルダ名と同じ形。
     * 添付でない uuid も混ざるので、使う側が保存先にあるかで見分ける）
     */
    uploadIdsIn(chatIds: number[]): Set<string> {
      const ids = new Set<string>();
      if (chatIds.length === 0) return ids;
      const rows = db
        .prepare(`SELECT data FROM chat_events WHERE chat_id IN (${chatIds.map(() => "?").join(",")}) AND type IN ('user', 'approval_resolved')`)
        .all(...chatIds) as { data: string }[];
      for (const { data } of rows) for (const m of data.matchAll(UUID_PATTERN)) ids.add(m[0]);
      return ids;
    },
    /** その添付をどれかのチャットの記録（自分の発言・質問への回答）か送信待ちが使っているか（ゴミ箱にあるチャットも数える） */
    uploadInUse(uploadId: string): boolean {
      return (
        db
          .prepare(
            `SELECT 1 FROM chat_events WHERE type IN ('user', 'approval_resolved') AND instr(data, $id) > 0
             UNION ALL SELECT 1 FROM chat_queues WHERE instr(messages, $id) > 0 LIMIT 1`,
          )
          .get({ id: uploadId }) !== undefined
      );
    },
    sessionInUse(sessionId: string): boolean {
      return Boolean(
        db
          .prepare(
            `SELECT 1 FROM chats WHERE session_id = $sid
             UNION ALL SELECT 1 FROM chat_events WHERE type IN ('init', 'result') AND json_extract(data, '$.session_id') = $sid LIMIT 1`,
          )
          .get({ sid: sessionId }),
      );
    },
    /**
     * このチャットの記録の init・result が指すセッション from を to に付け替える（長いチャットを直近の区切りだけの新しいセッションに乗り換えたとき。
     * 発言の ID は新しいセッションでも同じなので、残した区切りの中の起点からは分岐・巻き戻しができる）
     */
    remapSession(chatId: number, from: string, to: string): void {
      db.prepare(
        `UPDATE chat_events SET data = json_set(data, '$.session_id', ?)
         WHERE chat_id = ? AND type IN ('init', 'result') AND json_extract(data, '$.session_id') = ?`,
      ).run(to, chatId, from);
    },
    /** 記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用。全文検索の索引はトリガーで追従する） */
    deleteFrom(chatId: number, fromEventId: number): void {
      db.prepare("DELETE FROM chat_events WHERE chat_id = ? AND id >= ?").run(chatId, fromEventId);
      const chat = getChat(chatId);
      if (chat) onChange({ type: "chat_events_deleted", project_id: chat.project_id, chat_id: chatId, from_event_id: fromEventId });
    },
    /**
     * フィード: チャット（子チャット・メモのチャットを除く）ごとに、メインエージェントの最新の返答 1 件の初めの部分。返答の新しい順。
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
           WHERE c.parent_chat_id IS NULL AND c.memo_path IS NULL AND c.trashed_at IS NULL
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
