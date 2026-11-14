import type { DatabaseSync } from "node:sqlite";
import { TRASH_KEEP_MS, TRASH_KINDS, type TrashItem, type TrashKind } from "@shared/types";
import { bit, type Notify } from "./common.js";

interface TrashRow {
  id: string;
  project_id: number | null;
  kind: string;
  label: string;
  origin: string | null;
  is_dir: number;
  size: number | null;
  chat_id: number | null;
  by_chat_id: number | null;
  by_chat_title: string | null;
  details: string;
  trashed_at: string;
}

/** ゴミ箱に入れるときの中身（id は置き場のフォルダ名。trashed_at を省けばいま） */
export interface NewTrashItem {
  id: string;
  project_id: number | null;
  kind: TrashKind;
  label: string;
  origin?: string | null;
  is_dir?: boolean;
  chat_id?: number | null;
  by_chat_id?: number | null;
  details?: Record<string, unknown>;
  trashed_at?: string;
}

/** 店の中だけで使う形（種類ごとの覚え書き details も持つ） */
export type StoredTrashItem = TrashItem & { details: Record<string, unknown> };

const SELECT = "SELECT t.*, c.title AS by_chat_title FROM trash_items t LEFT JOIN chats c ON c.id = t.by_chat_id";

/** 知らない種類（あとの版で足したものなど）はファイルとして読む */
const kindOf = (value: string): TrashKind => ((TRASH_KINDS as readonly string[]).includes(value) ? (value as TrashKind) : "file");

const toItem = (r: TrashRow): StoredTrashItem => ({
  id: r.id,
  project_id: r.project_id,
  kind: kindOf(r.kind),
  label: r.label,
  origin: r.origin,
  is_dir: r.is_dir === 1,
  size: r.size,
  chat_id: r.chat_id,
  by_chat_id: r.by_chat_id,
  by_chat_title: r.by_chat_title,
  trashed_at: r.trashed_at,
  expires_at: new Date(Date.parse(r.trashed_at) + TRASH_KEEP_MS).toISOString(),
  details: JSON.parse(r.details) as Record<string, unknown>,
});

/** Kickoff のゴミ箱（trash_items の表）。中身のファイルは trash/TrashService が置き場に置き、ここは覚え書きだけ */
export function createTrashStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: string): StoredTrashItem | null => {
    const r = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as TrashRow | undefined;
    return r ? toItem(r) : null;
  };
  return {
    get,
    /** プロジェクトのゴミ箱（新しい順） */
    list(projectId: number): StoredTrashItem[] {
      return (db.prepare(`${SELECT} WHERE t.project_id = ? ORDER BY t.trashed_at DESC, t.id`).all(projectId) as unknown as TrashRow[]).map(toItem);
    },
    /** すべて（置き場の片付けで、覚え書きのないフォルダを見分けるのに使う） */
    all(): StoredTrashItem[] {
      return (db.prepare(`${SELECT} ORDER BY t.trashed_at`).all() as unknown as TrashRow[]).map(toItem);
    },
    /** 入れた時刻が before より前のもの（本当に消すもの） */
    expiredBefore(before: string): StoredTrashItem[] {
      return (db.prepare(`${SELECT} WHERE t.trashed_at < ? ORDER BY t.trashed_at`).all(before) as unknown as TrashRow[]).map(toItem);
    },
    /** ゴミ箱に入れたチャットの行（チャットを指すもの） */
    ofChat(chatId: number): StoredTrashItem | null {
      const r = db.prepare(`${SELECT} WHERE t.kind = 'chat' AND t.chat_id = ?`).get(chatId) as TrashRow | undefined;
      return r ? toItem(r) : null;
    },
    add(item: NewTrashItem): StoredTrashItem {
      db.prepare(
        `INSERT INTO trash_items (id, project_id, kind, label, origin, is_dir, chat_id, by_chat_id, details, trashed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
      ).run(
        item.id,
        item.project_id,
        item.kind,
        item.label,
        item.origin ?? null,
        bit(item.is_dir ?? false),
        item.chat_id ?? null,
        item.by_chat_id ?? null,
        JSON.stringify(item.details ?? {}),
        item.trashed_at ?? null,
      );
      onChange({ type: "trash", project_id: item.project_id });
      return get(item.id)!;
    },
    /** 大きさを書く（数え終わったとき。知らせも出す） */
    setSize(id: string, size: number): void {
      const item = get(id);
      if (!item) return;
      db.prepare("UPDATE trash_items SET size = ? WHERE id = ?").run(size, id);
      onChange({ type: "trash", project_id: item.project_id });
    },
    /** 種類ごとの覚え書きを書き直す（AI が入れたメモに、メモのフォルダからのパスを足すなど） */
    setDetails(id: string, details: Record<string, unknown>): void {
      db.prepare("UPDATE trash_items SET details = ? WHERE id = ?").run(JSON.stringify(details), id);
    },
    /** 行を消す（戻した・本当に消した） */
    remove(id: string): void {
      const item = get(id);
      if (!item) return;
      db.prepare("DELETE FROM trash_items WHERE id = ?").run(id);
      onChange({ type: "trash", project_id: item.project_id });
    },
  };
}
