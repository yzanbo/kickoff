import type { DatabaseSync } from "node:sqlite";
import type { Chat, ChatEvent, ChatEventData, SearchHit } from "@shared/types";
import type { Notify, Row } from "./common.js";

interface EventRow {
  id: number;
  chat_id: number;
  type: ChatEvent["type"];
  data: string;
  created_at: string;
}

/** 記録の列（生成列 text は検索だけに使うので、読み出す形には入れない） */
const EVENT_COLUMNS = "id, chat_id, type, data, created_at";

const toEvent = (row: EventRow): ChatEvent => ({ ...row, data: JSON.parse(row.data) }) as ChatEvent;

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
    /** 記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用。全文検索の索引はトリガーで追従する） */
    deleteFrom(chatId: number, fromEventId: number): void {
      db.prepare("DELETE FROM chat_events WHERE chat_id = ? AND id >= ?").run(chatId, fromEventId);
      const chat = getChat(chatId);
      if (chat) onChange({ type: "chat_events_deleted", project_id: chat.project_id, chat_id: chatId, from_event_id: fromEventId });
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
           WHERE ${where.join(" AND ")}
           ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
        )
        .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
      return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
    },
  };
}
