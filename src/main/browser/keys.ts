// 埋め込みブラウザのキーの判定と変換（Electron の実体に依らないのでテストする）

import type { Input } from "electron";

/** ページ内検索の ⌘F（Mac 以外は Ctrl+F）。変換中や、ほかの修飾キーが付いたキーはページに任せる */
export function isBrowserFindKey(
  input: Pick<Input, "type" | "key" | "meta" | "control" | "alt" | "shift" | "isComposing">,
  mac = process.platform === "darwin",
): boolean {
  return input.type === "keyDown" && input.key.toLowerCase() === "f" && !input.isComposing &&
    !input.alt && !input.shift && input.meta === mac && input.control !== mac;
}

/** Web の KeyboardEvent.key の名前 → Electron のキーの名前（同じものは書かない） */
const ALIASES: Record<string, string> = {
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  return: "Enter",
  esc: "Escape",
  " ": "Space",
  del: "Delete",
};

/** よく使うキー（大文字・小文字を問わずに受ける） */
const NAMED = ["Enter", "Escape", "Tab", "Backspace", "Delete", "Space", "Up", "Down", "Left", "Right", "PageUp", "PageDown", "Home", "End"];

/** キーの名前（Enter・ArrowDown・a など）を keyCode にする。知らない名前はそのまま渡す */
export function browserKeyCode(key: string): string {
  const lower = key.toLowerCase();
  return ALIASES[lower] ?? NAMED.find((n) => n.toLowerCase() === lower) ?? key;
}
