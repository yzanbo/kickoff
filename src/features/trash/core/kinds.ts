// ゴミ箱の種類ごとの扱い（上の機能が createX の中で trash の registerKind に渡す。trash は種類の中身を知らない）
import type { TrashKind } from "@shared/trash/types";
import type { StoredTrashItem } from "./db/trash";

/**
 * 種類ごとの扱い（チャット・プロジェクトなど、置き場にファイルを置かないもの・戻すときに一緒に戻すものがある種類）。
 * 行を消す・置き場のフォルダを消すのはサービスがする
 */
export interface TrashKindHandler {
  /** 元に戻す（ファイルの種類は、ファイルを戻したあとに呼ぶ。restoredPath は戻した場所 = 同じ名前があって別の名前で戻したなら元の場所と違う） */
  restore?(item: StoredTrashItem, restoredPath: string | null): void | Promise<void>;
  /** 本当に消す */
  purge?(item: StoredTrashItem): void | Promise<void>;
}

/** 登録する種類（上の機能が createX の中で registerKind に渡す） */
export interface TrashKindDef extends TrashKindHandler {
  kind: TrashKind;
}
