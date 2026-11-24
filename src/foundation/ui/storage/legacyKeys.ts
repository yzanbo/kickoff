// storageKeys.ts（まだ機能へ配っていない残りの宣言）をまとめて包む仮の群（起動の片付けが宣言済みとみなすのは、渡した群だけ。
// @/app/renderer/storage.ts が集める）。キーは前の名前のまま。残りを読み手を直す段で持ち主の ui/storage.ts へ移したら、このファイルと storageKeys.ts を消す
import type { StorageGroup } from "./groups";
import * as keys from "./storageKeys";

/** 設定の宣言か（単独の設定はキー、ID ごとの設定は頭を持つ） */
const isDeclared = (value: unknown) => (typeof value === "function" ? "prefix" in value : typeof value === "object" && value !== null && "key" in value);

export const storage: StorageGroup = {
  namespace: "keys",
  settings: Object.fromEntries(Object.entries(keys).filter(([, value]) => isDeclared(value))) as StorageGroup["settings"],
};
