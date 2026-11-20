// storageKeys.ts の宣言をまとめて包む仮の群（起動の片付けが宣言済みとみなすのは、渡した群だけ。@/app/renderer/storage.ts が集める）。
// キーは前の名前のまま。0018 の P4-2b で、機能ごとの ui/storage.ts の defineSettings に配り、このファイルと storageKeys.ts を消す
import type { StorageGroup } from "./groups";
import * as keys from "./storageKeys";

/** 設定の宣言か（単独の設定はキー、ID ごとの設定は頭を持つ） */
const isDeclared = (value: unknown) => (typeof value === "function" ? "prefix" in value : typeof value === "object" && value !== null && "key" in value);

export const storage: StorageGroup = {
  namespace: "keys",
  settings: Object.fromEntries(Object.entries(keys).filter(([, value]) => isDeclared(value))) as StorageGroup["settings"],
};
