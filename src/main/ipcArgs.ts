// 画面から届く IPC の引数の検査（Electron に依らないので、テストできる）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTERNAL_TERMINALS, type ExternalTerminalId } from "../core/types.js";

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

/** 対応している外部のターミナルか確かめる（知らないものは Terminal.app にする） */
export function knownTerminal(id: unknown): ExternalTerminalId {
  return EXTERNAL_TERMINALS.some((t) => t.id === id) ? (id as ExternalTerminalId) : "terminal";
}

/**
 * 外部のターミナルでフォルダを開く `open` の引数。アプリごとに作業フォルダの渡し方が違う
 * （Terminal・iTerm2・Warp はフォルダを開かせる。Ghostty・WezTerm・Alacritty・kitty は新しい窓に作業フォルダを渡す）
 */
export function externalTerminalArgs(id: ExternalTerminalId, dir: string): string[] {
  switch (id) {
    case "ghostty":
      return ["-na", "Ghostty", "--args", `--working-directory=${dir}`];
    case "wezterm":
      return ["-na", "WezTerm", "--args", "start", "--cwd", dir];
    case "alacritty":
      return ["-na", "Alacritty", "--args", "--working-directory", dir];
    case "kitty":
      return ["-na", "kitty", "--args", "--directory", dir];
    case "iterm":
      return ["-a", "iTerm", dir];
    case "warp":
      return ["-a", "Warp", dir];
    default:
      return ["-a", "Terminal", dir];
  }
}

/** この Mac に入っている外部のターミナル（Terminal.app はいつも入っている） */
export function installedTerminals(home = os.homedir(), exists: (p: string) => boolean = fs.existsSync): ExternalTerminalId[] {
  return EXTERNAL_TERMINALS.filter(
    (t) => t.id === "terminal" || [`/Applications/${t.app}.app`, path.join(home, "Applications", `${t.app}.app`)].some(exists),
  ).map((t) => t.id);
}
