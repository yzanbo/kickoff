import path from "node:path";
import { KNOWN_EXTENSION_KEYS, type BrowserExtensionInfo, type KnownExtensionKey } from "@shared/foundation/ipc";

// 拡張機能のフォルダの判定（Electron に依らないので、テストできる）

/**
 * 消してよい拡張機能のフォルダか: Kickoff が取得・写した拡張機能を入れる保存先（root）の、すぐ下のフォルダだけ。
 * 画面から届いたパスは信じず、".." などを解決してから比べる（保存先そのもの・保存先の外・名前が保存先で始まるだけの隣のフォルダ・
 * 拡張機能の中のフォルダは消さない）
 */
export function isManagedExtensionDir(root: string, target: string): boolean {
  return path.dirname(path.resolve(target)) === path.resolve(root);
}

const CHROME_PREFIX = "chrome-";

/** よく使う拡張機能を入れるフォルダ（ウェブストアから取ったものはキー、Chrome から写したものは「chrome-キー」） */
export function knownExtensionDir(root: string, key: KnownExtensionKey, source: "webstore" | "chrome-profile"): string {
  return path.join(root, source === "chrome-profile" ? `${CHROME_PREFIX}${key}` : key);
}

/** 保存先のフォルダから、出どころとよく使う拡張機能のどれかを読む（保存先のすぐ下でなければ「フォルダを指定」） */
export function extensionOrigin(root: string, dir: string): Pick<BrowserExtensionInfo, "source" | "key"> {
  if (!isManagedExtensionDir(root, dir)) return { source: "folder", key: null };
  const base = path.basename(path.resolve(dir));
  const fromChrome = base.startsWith(CHROME_PREFIX);
  const name = fromChrome ? base.slice(CHROME_PREFIX.length) : base;
  const key = KNOWN_EXTENSION_KEYS.find((k) => k === name) ?? null;
  return { source: fromChrome ? "chrome-profile" : "webstore", key };
}
