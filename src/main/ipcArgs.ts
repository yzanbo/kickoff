// 画面から届く IPC の引数の検査（Electron に依らないので、テストできる）
import fs from "node:fs";
import path from "node:path";

/** よく使う拡張機能の Chrome ウェブストア ID */
export const KNOWN_EXTENSIONS = {
  "react-devtools": { id: "fmkadmapgofadopljbjfkapdkoienihi", name: "React Developer Tools" },
} as const;

export type KnownExtensionKey = keyof typeof KNOWN_EXTENSIONS;

/** 対応している拡張機能のキーか確かめる */
export function knownExtension(key: unknown): KnownExtensionKey {
  // in だと Object.prototype の名前（toString など）も通ってしまうので、自分の項目だけを見る
  if (typeof key !== "string" || !Object.hasOwn(KNOWN_EXTENSIONS, key)) throw new Error("未対応の拡張機能です");
  return key as KnownExtensionKey;
}

/** 埋め込みブラウザ（WebContents）の ID の指定か確かめる */
export function webContentsId(value: unknown): number {
  if (typeof value !== "number") throw new Error("開発者ツールの指定が正しくありません");
  return value;
}

/** 外部のターミナルで開くフォルダの指定か確かめる（絶対パスの、いまあるフォルダ） */
export function existingFolder(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("フォルダの場所が正しくありません");
  if (!fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`フォルダが見つかりません: ${value}`);
  return value;
}
