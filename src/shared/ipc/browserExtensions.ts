// 埋め込みブラウザの拡張機能（React DevTools など）。メインプロセスと画面で同じ形

/** 読み込んでいる拡張機能 */
export interface BrowserExtensionInfo {
  name: string;
  version: string;
  path: string;
  /** webstore: ウェブストアから取得 / chrome-profile: Chrome から写した / folder: 展開済みのフォルダを指定 */
  source: "webstore" | "chrome-profile" | "folder";
}

/** よく使う拡張機能（id は Chrome ウェブストアの ID。ボタン 1 つで取得・Chrome から写せる） */
export const KNOWN_EXTENSIONS = {
  "react-devtools": { id: "fmkadmapgofadopljbjfkapdkoienihi", name: "React Developer Tools" },
} as const;

export type KnownExtensionKey = keyof typeof KNOWN_EXTENSIONS;
