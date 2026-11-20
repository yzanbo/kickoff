import type { DatabaseSync } from "node:sqlite";
import { TRASH_KEEP_MS, TRASH_KINDS, type TrashDetails, type TrashItem, type TrashKind } from "@shared/trash/types";
import type { Notify } from "@/foundation/core/db/common";
import type { RowOf } from "@/foundation/core/db/table";
import { trashItemsTable } from "@/features/trash/core/schema";

/** ゴミ箱に入れるときの中身（id は置き場のフォルダ名。trashed_at は片付けと同じ時計で入れる側が付ける） */
export interface NewTrashItem {
  id: string;
  project_id: number | null;
  kind: TrashKind;
  label: string;
  origin?: string | null;
  is_dir?: boolean;
  chat_id?: number | null;
  by_chat_id?: number | null;
  details?: TrashDetails;
  trashed_at: string;
}

/** 店の中だけで使う形（種類ごとの覚え書き details も持つ） */
export type StoredTrashItem = TrashItem & { details: TrashDetails };

/** チャットの名前（ゴミ箱のチャットも。もうないチャットは入れない） */
type ChatTitles = (ids: readonly number[]) => Map<number, string>;

/** ゴミ箱が読むチャット（チャットは上の機能なので、chat が TrashService.useChats で登録する） */
export interface TrashChats {
  /** 消したチャットの名前（登録するまでは分からない = null） */
  titlesOf: ChatTitles;
  /** チャットのプロジェクト（ゴミ箱のもの・もうないものは null。AI の kickoff-trash で入れたものを出すゴミ箱） */
  projectOf(chatId: number): number | null;
}

export type TrashStore = ReturnType<typeof createTrashStore>;

/** 知らない種類（あとの版で足したものなど）はファイルとして読む */
const kindOf = (value: string): TrashKind => ((TRASH_KINDS as readonly string[]).includes(value) ? (value as TrashKind) : "file");

/** Kickoff のゴミ箱（trash_items の表）。中身のファイルは trash/TrashService が置き場に置き、ここは覚え書きだけ */
export function createTrashStore(db: DatabaseSync, onChange: Notify) {
  const rows = trashItemsTable.on(db);
  let chatTitles: ChatTitles | null = null;
  /** 行をゴミ箱の形にする（消したチャットの名前を引く。もうないチャットは、消したチャットも null） */
  const toItems = (list: RowOf<typeof trashItemsTable.columns>[]): StoredTrashItem[] => {
    const byChat = list.flatMap((r) => (r.by_chat_id === null ? [] : [r.by_chat_id]));
    const titles = chatTitles && byChat.length > 0 ? chatTitles(byChat) : null;
    return list.map((r) => {
      const title = r.by_chat_id === null ? null : (titles?.get(r.by_chat_id) ?? null);
      return {
        ...r,
        kind: kindOf(r.kind),
        by_chat_id: titles && title === null ? null : r.by_chat_id,
        by_chat_title: title,
        expires_at: new Date(Date.parse(r.trashed_at) + TRASH_KEEP_MS).toISOString(),
      };
    });
  };
  const get = (id: string): StoredTrashItem | null => {
    const r = rows.get(id);
    return r ? toItems([r])[0] : null;
  };
  const changed = (projectId: number | null) => onChange({ type: "trash", project_id: projectId });
  return {
    get,
    /** 消したチャットの名前の引き方（chat が登録する） */
    useChatTitles(fn: ChatTitles): void {
      chatTitles = fn;
    },
    /** プロジェクトのゴミ箱（新しい順） */
    list: (projectId: number): StoredTrashItem[] => toItems(rows.list("project_id = ?", [projectId])),
    /** どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など。設定の「ゴミ箱と整理」に出す） */
    unassigned: (): StoredTrashItem[] => toItems(rows.list("project_id IS NULL")),
    /** その種類のものすべて（ゴミ箱のプロジェクトの一覧。新しい順） */
    ofKind: (kind: TrashKind): StoredTrashItem[] => toItems(rows.list("kind = ?", [kind])),
    /** すべて（置き場の片付けで、覚え書きのないフォルダを見分けるのに使う） */
    all: (): StoredTrashItem[] => toItems(rows.list()),
    /** 入れた時刻が before より前のもの（本当に消すもの） */
    expiredBefore: (before: string): StoredTrashItem[] => toItems(rows.list("trashed_at < ?", [before])),
    /** ゴミ箱に入れたチャットの行（チャットを指すもの） */
    ofChat(chatId: number): StoredTrashItem | null {
      const r = rows.one("kind = 'chat' AND chat_id = ?", [chatId]);
      return r ? toItems([r])[0] : null;
    },
    add(item: NewTrashItem): StoredTrashItem {
      rows.insert({ ...item, origin: item.origin ?? null, is_dir: item.is_dir ?? false, details: item.details ?? {} });
      changed(item.project_id);
      return get(item.id)!;
    },
    /** 大きさを書く（数え終わったとき。知らせも出す） */
    setSize(id: string, size: number): void {
      const item = rows.get(id);
      if (!item) return;
      rows.update(id, { size });
      changed(item.project_id);
    },
    /** 種類ごとの覚え書きを書き直す（AI が入れたノートに、ノートのフォルダからのパスを足すなど） */
    setDetails(id: string, details: TrashDetails): void {
      if (rows.get(id)) rows.update(id, { details });
    },
    /** 行を消す（戻した・本当に消した） */
    remove(id: string): void {
      const item = rows.get(id);
      if (!item || !rows.remove(id)) return;
      changed(item.project_id);
    },
  };
}
