import type { DatabaseSync } from "node:sqlite";
import type { Chat, ChatStatus } from "@shared/types";
import { bit, updateRow, type Notify, type Row } from "./common.js";
import type { NewChat } from "./types.js";

/** チャットの一覧の絞り込み（並びは最後に動いた順） */
export interface ChatFilter {
  projectId?: number;
  statuses?: ChatStatus[];
  limit?: number;
  includeArchived?: boolean;
  onlyArchived?: boolean;
}

/** update で変えられる列（型と UPDATE の対象をここ 1 つで決める。固定・グループ・プロジェクトは専用の操作で変える） */
const CHAT_COLUMNS = [
  "title",
  "status",
  "error",
  "session_id",
  "turn_started_at",
  "model",
  "effort",
  "permission_mode",
  "fast_mode",
  "cost_usd",
  "num_turns",
  "context_tokens",
  "context_window",
  "branch",
  "unread",
  "archived_at",
] as const satisfies readonly (keyof Chat)[];

/** チャットの変えられる項目 */
export type ChatPatch = Partial<Pick<Chat, (typeof CHAT_COLUMNS)[number]>>;

/** DB の行（真偽値は 0 / 1） */
type ChatRow = Omit<Chat, "fast_mode" | "unread" | "pinned"> & { fast_mode: number; unread: number; pinned: number };

/** DB の行をアプリの型にする（真偽値の列を boolean に） */
function toChat(row: unknown): Chat {
  const r = row as ChatRow;
  return { ...r, fast_mode: r.fast_mode === 1, unread: r.unread === 1, pinned: r.pinned === 1 };
}

/** 変える項目を DB の列の値にする（真偽値は 0 / 1） */
function toChatRow({ fast_mode, unread, ...rest }: ChatPatch): Row {
  return { ...rest, fast_mode: bit(fast_mode), unread: bit(unread) } as Row;
}

/** チャット（chats の表。エージェントとの会話。記録は events.ts） */
export function createChatStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Chat | undefined => {
    const row = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
    return row ? toChat(row) : undefined;
  };
  /** 1 列だけ変えて、変更を知らせる（最後に動いた時刻は進めない: 並び順を変えない操作に使う） */
  const setColumn = (id: number, column: "unread" | "pinned" | "group_id", value: number | null): Chat => {
    db.prepare(`UPDATE chats SET ${column} = ? WHERE id = ?`).run(value, id);
    const chat = get(id)!;
    onChange({ type: "chat", chat });
    return chat;
  };
  const inWorktree = (projectId: number, worktreePath: string): Chat[] =>
    db.prepare("SELECT * FROM chats WHERE project_id = ? AND worktree_path = ? ORDER BY id").all(projectId, worktreePath).map(toChat);

  return {
    get,
    list(filter: ChatFilter = {}): Chat[] {
      const where: string[] = filter.onlyArchived ? ["archived_at IS NOT NULL"] : filter.includeArchived ? [] : ["archived_at IS NULL"];
      const params: Row = {};
      if (filter.projectId !== undefined) {
        where.push("project_id = $project_id");
        params.project_id = filter.projectId;
      }
      if (filter.statuses?.length) where.push(`status IN (${filter.statuses.map((s) => `'${s}'`).join(",")})`);
      const limit = filter.limit === undefined ? "" : ` LIMIT ${Math.trunc(filter.limit)}`;
      return db
        .prepare(`SELECT * FROM chats ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY active_at DESC, id DESC${limit}`)
        .all(params)
        .map(toChat);
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
          input.model ?? null,
          input.effort ?? null,
          input.permission_mode ?? "default",
          bit(input.fast_mode ?? false),
          input.group_id ?? null,
          input.worktree_path ?? null,
        );
      const chat = get(Number(lastInsertRowid))!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /**
     * 項目を変えて知らせる。状態（status）を変える更新は「動いた」なので、最後に動いた時刻（一覧の並び順）も進める
     * （送った・作業が終わった。名前・未読・アーカイブなどの変更では進めない）
     */
    update(id: number, patch: ChatPatch): Chat {
      updateRow(db, "chats", id, toChatRow(patch), CHAT_COLUMNS, patch.status !== undefined);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /** チャットを完全に削除する（会話の記録・送信待ちも消える） */
    delete(id: number) {
      const chat = get(id);
      if (!chat) return;
      db.prepare("DELETE FROM chats WHERE id = ?").run(id);
      onChange({ type: "chat_deleted", id, project_id: chat.project_id });
    },
    /** 未読の印を付ける・外す */
    setUnread: (id: number, unread: boolean) => setColumn(id, "unread", bit(unread)),
    /** サイドバーの上に固定する・やめる */
    setPinned: (id: number, pinned: boolean) => setColumn(id, "pinned", bit(pinned)),
    /** チャットをグループへ移す（null でグループから外す。同じプロジェクトのグループだけ: トリガーで守る） */
    setGroup: (id: number, groupId: number | null) => setColumn(id, "group_id", groupId),
    /**
     * チャットを別のプロジェクトへ移す。グループ・作業場所（ワークツリー）・最後に作業したブランチは元のプロジェクトのものなので外す
     * （作業場所は移った先の本体になる）。並び順は変えない
     */
    move(id: number, projectId: number): Chat {
      db.prepare("UPDATE chats SET project_id = ?, group_id = NULL, worktree_path = NULL, branch = NULL WHERE id = ?").run(projectId, id);
      const chat = get(id)!;
      onChange({ type: "chat", chat });
      return chat;
    },
    /**
     * 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す。
     * 完了 = 終わっていて（完了・中断）、未読の印がなく、固定していないもの（失敗・作業中・固定したものはしない）
     */
    archiveStale(days: number, now = new Date()): number {
      const before = new Date(now.getTime() - days * 86_400_000).toISOString();
      const rows = db
        .prepare("SELECT id FROM chats WHERE archived_at IS NULL AND status IN ('completed', 'cancelled') AND unread = 0 AND pinned = 0 AND active_at < ?")
        .all(before) as { id: number }[];
      const at = now.toISOString();
      for (const { id } of rows) {
        db.prepare("UPDATE chats SET archived_at = ? WHERE id = ?").run(at, id);
        onChange({ type: "chat", chat: get(id)! });
      }
      return rows.length;
    },
    /** その作業場所（ワークツリー）を使っているチャット */
    inWorktree,
    /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
    clearWorktree(projectId: number, worktreePath: string): void {
      const chats = inWorktree(projectId, worktreePath);
      db.prepare("UPDATE chats SET worktree_path = NULL WHERE project_id = ? AND worktree_path = ?").run(projectId, worktreePath);
      for (const chat of chats) onChange({ type: "chat", chat: get(chat.id)! });
    },
    /** 起動時の復旧: 前回終了時に作業中だったチャットを、未読の失敗にする（最後に動いた時刻は変えない）。直した数を返す */
    recoverInterrupted(error: string): number {
      const { changes } = db.prepare("UPDATE chats SET status = 'failed', error = ?, unread = 1 WHERE status = 'running'").run(error);
      return Number(changes);
    },
  };
}
