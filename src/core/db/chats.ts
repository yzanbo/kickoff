import type { DatabaseSync } from "node:sqlite";
import type { NewChat, Chat, ChatEvent, ChatEventData, ChatStatus, SearchHit } from "@shared/types";
import { bit, touchProject, updateRow, type Notify, type Row } from "./common.js";

/** チャットの一覧の絞り込み */
export interface ChatFilter {
  projectId?: number;
  statuses?: ChatStatus[];
  limit?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

/** チャットの変えられる項目 */
export type ChatPatch = Partial<
  Pick<
    Chat,
    | "title"
    | "status"
    | "session_id"
    | "model"
    | "effort"
    | "permission_mode"
    | "fast_mode"
    | "cost_usd"
    | "num_turns"
    | "result"
    | "error"
    | "unread"
    | "archived_at"
    | "context_tokens"
    | "context_window"
    | "branch"
    | "turn_started_at"
  >
>;

const CHAT_COLUMNS = [
  "branch",
  "turn_started_at",
  "unread",
  "archived_at",
  "context_tokens",
  "context_window",
  "fast_mode",
  "title",
  "status",
  "session_id",
  "model",
  "effort",
  "permission_mode",
  "cost_usd",
  "num_turns",
  "result",
  "error",
] as const;

interface EventRow {
  id: number;
  chat_id: number;
  type: ChatEvent["type"];
  data: string;
  created_at: string;
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

/** ワークツリーで作業しているチャット（索引 idx_chats_worktree の条件と同じ式。書くと、その索引で引ける） */
const IN_WORKTREE = "worktree_path <> ''";

/** DB の行（真偽値は 0 / 1） */
type ChatDbRow = Omit<Chat, "fast_mode" | "unread" | "pinned"> & { fast_mode: number; unread: number; pinned: number };

/** DB の行をアプリの型に変換する（真偽値の列を boolean に） */
function toChat(row: unknown): Chat {
  const r = row as ChatDbRow;
  return { ...r, fast_mode: r.fast_mode === 1, unread: r.unread === 1, pinned: r.pinned === 1 };
}

/** 変える項目を DB の列の値にする（真偽値は 0 / 1） */
function toChatRow({ fast_mode, unread, ...rest }: ChatPatch): Row {
  return { ...rest, fast_mode: bit(fast_mode), unread: bit(unread) } as Row;
}

/** チャット（エージェントとの会話セッション）と、その記録（chat_events）・検索 */
export function createChatStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Chat | undefined => {
    const row = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
    return row ? toChat(row) : undefined;
  };
  /** 1 列だけ変えて、変更を知らせる（active_at は進めない: 並び順を変えない操作に使う） */
  const setColumn = (id: number, column: "unread" | "pinned" | "group_id", value: number | null): Chat => {
    db.prepare(`UPDATE chats SET ${column} = ? WHERE id = ?`).run(value, id);
    const chat = get(id)!;
    onChange({ type: "chat", chat });
    return chat;
  };
  const inWorktree = (projectId: number, worktreePath: string): Chat[] =>
    db.prepare(`SELECT * FROM chats WHERE project_id = ? AND worktree_path = ? AND ${IN_WORKTREE} ORDER BY id`).all(projectId, worktreePath).map(toChat);

  return {
    get,
    list(filter: ChatFilter = {}): Chat[] {
      const where: string[] = filter.onlyArchived ? ["archived_at IS NOT NULL"] : filter.includeArchived ? [] : ["archived_at IS NULL"];
      const params: Row = {};
      if (filter.projectId !== undefined) {
        where.push("project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.statuses?.length) {
        where.push(`status IN (${filter.statuses.map((s) => `'${s}'`).join(",")})`);
      }
      const sql = `SELECT * FROM chats ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ${filter.limit ?? 100}`;
      return db.prepare(sql).all(params).map(toChat);
    },
    create(input: NewChat): Chat {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO chats (project_id, provider, title, status, model, effort, permission_mode, fast_mode, group_id, worktree_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.project_id,
          input.provider,
          input.title,
          input.status,
          input.model,
          input.effort ?? null,
          input.permission_mode ?? "default",
          bit(input.fast_mode ?? false),
          input.group_id ?? null,
          input.worktree_path ?? "",
        );
      const chat = get(Number(lastInsertRowid))!;
      touchProject(db, chat.project_id);
      onChange({ type: "chat", chat });
      return chat;
    },
    update(id: number, patch: ChatPatch): Chat {
      updateRow(db, "chats", id, toChatRow(patch), CHAT_COLUMNS, true);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /** チャットを完全に削除する（会話の記録も消える） */
    delete(id: number) {
      const chat = get(id);
      if (!chat) return;
      db.prepare("DELETE FROM chats WHERE id = ?").run(id);
      onChange({ type: "chat_deleted", id, project_id: chat.project_id });
    },
    /** 未読の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
    setUnread: (id: number, unread: boolean) => setColumn(id, "unread", bit(unread)),
    /** サイドバーの上に固定する・やめる（最後に動いた時刻（並び順）は変えない） */
    setPinned: (id: number, pinned: boolean) => setColumn(id, "pinned", bit(pinned)),
    /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
    setGroup: (id: number, groupId: number | null) => setColumn(id, "group_id", groupId),
    /**
     * チャットを別のプロジェクトへ移す。グループ・作業場所（ワークツリー）・最後に作業したブランチは元のプロジェクトのものなので外す
     * （作業場所は移った先の本体になる）。並び順が変わらないよう更新日時は進めない
     */
    move(id: number, projectId: number): Chat {
      db.prepare("UPDATE chats SET project_id = ?, group_id = NULL, worktree_path = '', branch = '' WHERE id = ?").run(projectId, id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /**
     * 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す。
     * 完了 = 終わっていて（完了・中断）、未読の印がなく、固定していないもの（エラー・回答待ち・作業中・固定したものはしない）
     */
    archiveStale(days: number, now = new Date()): number {
      const before = new Date(now.getTime() - days * 86_400_000).toISOString();
      const rows = db
        .prepare(
          "SELECT id FROM chats WHERE archived_at IS NULL AND status IN ('completed', 'cancelled') AND unread = 0 AND pinned = 0 AND active_at < ?",
        )
        .all(before) as { id: number }[];
      const at = now.toISOString();
      for (const { id } of rows) {
        db.prepare("UPDATE chats SET archived_at = ? WHERE id = ?").run(at, id);
        onChange({ type: "chat", chat: get(id)! });
      }
      return rows.length;
    },
    /** その作業場所（ワークツリー）を使っているチャット（本体（空）は対象外） */
    inWorktree,
    /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
    clearWorktree(projectId: number, worktreePath: string): void {
      const chats = inWorktree(projectId, worktreePath);
      db.prepare(`UPDATE chats SET worktree_path = '' WHERE project_id = ? AND worktree_path = ? AND ${IN_WORKTREE}`).run(projectId, worktreePath);
      for (const chat of chats) onChange({ type: "chat", chat: get(chat.id)! });
    },
    addEvent(chatId: number, event: ChatEventData): ChatEvent {
      const { type, ...data } = event;
      const { lastInsertRowid } = db.prepare("INSERT INTO chat_events (chat_id, type, data) VALUES (?, ?, ?)").run(chatId, type, JSON.stringify(data));
      const row = db.prepare("SELECT * FROM chat_events WHERE id = ?").get(Number(lastInsertRowid)) as unknown as EventRow;
      const saved: ChatEvent = { ...row, data: JSON.parse(row.data) };
      const chat = get(chatId);
      if (chat) onChange({ type: "chat_event", project_id: chat.project_id, event: saved });
      return saved;
    },
    /** 未読にする「新しい結果」（state.ts の isUnreadEvent と同じもの）のうち、いちばん新しい記録の id（なければ 0） */
    latestUnreadEventId(chatId: number): number {
      const row = db
        .prepare(
          "SELECT MAX(id) AS id FROM chat_events WHERE chat_id = ? AND ((type = 'text' AND COALESCE(json_extract(data, '$.sub'), 0) = 0) OR type IN ('result', 'error'))",
        )
        .get(chatId) as { id: number | null };
      return row.id ?? 0;
    },
    /** 会話の記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用。1 件ずつは知らせない） */
    copyEvents(fromChatId: number, toChatId: number, upToEventId: number): void {
      db.prepare(
        "INSERT INTO chat_events (chat_id, type, data, created_at) SELECT ?, type, data, created_at FROM chat_events WHERE chat_id = ? AND id <= ? ORDER BY id",
      ).run(toChatId, fromChatId, upToEventId);
    },
    /** 会話の記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用。全文検索の索引はトリガーで追従する） */
    deleteEventsFrom(chatId: number, fromEventId: number): void {
      db.prepare("DELETE FROM chat_events WHERE chat_id = ? AND id >= ?").run(chatId, fromEventId);
      const chat = get(chatId);
      if (chat) onChange({ type: "chat_events_deleted", project_id: chat.project_id, chat_id: chatId, from_event_id: fromEventId });
    },
    listEvents(chatId: number): ChatEvent[] {
      const rows = db.prepare("SELECT * FROM chat_events WHERE chat_id = ? ORDER BY id ASC").all(chatId) as unknown as EventRow[];
      return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
    },
    /** チャットのやり取り（自分の発言と AI の返答）をキーワードで検索する（部分一致・大文字と小文字を区別しない）。新しい順 */
    searchEvents(query: string, filter: { projectId?: number; chatId?: number; limit?: number } = {}): SearchHit[] {
      const keyword = query.trim();
      if (!keyword) return [];
      const { from, where, params } = keywordMatch(keyword);
      if (filter.projectId !== undefined) {
        where.push("r.project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.chatId !== undefined) {
        where.push("e.chat_id = $chat_id");
        params.chat_id = filter.chatId;
      }
      const rows = db
        .prepare(
          `SELECT e.id AS event_id, e.chat_id, r.project_id, r.title AS chat_title, e.type, e.text, e.created_at
           FROM ${from} JOIN chats r ON r.id = e.chat_id
           WHERE ${where.join(" AND ")}
           ORDER BY e.id DESC LIMIT ${Math.min(filter.limit ?? 50, 200)}`,
        )
        .all(params) as (Omit<SearchHit, "snippet" | "match_start" | "match_end"> & { text: string })[];
      return rows.map(({ text, ...row }) => ({ ...row, ...snippetAround(text, keyword) }));
    },
  };
}
