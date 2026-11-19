// 埋め込みブラウザの拡張機能（React DevTools など）。メインプロセスと画面で同じ形

/** 保存してある拡張機能（読み込めなかったものも、消せるように一覧に出す） */
export interface BrowserExtensionInfo {
  name: string;
  /** 読み込めなかったときは null */
  version: string | null;
  path: string;
  /** webstore: ウェブストアから取得 / chrome-profile: Chrome から写した / folder: 展開済みのフォルダを指定 */
  source: "webstore" | "chrome-profile" | "folder";
  /** よく使う拡張機能のどれか（ボタンで足したもの。フォルダを指定したものは null） */
  key: KnownExtensionKey | null;
  /** 読み込めなかった理由（読み込めていれば null） */
  error: string | null;
}

/**
 * よく使う拡張機能（id は Chrome ウェブストアの ID。ボタン 1 つで取得・Chrome から写せる）。並びは画面の並び。
 * Electron で動くのは開発者ツールにパネルを足すもの（ツールバーのポップアップを使うものは動かない）。
 * Angular DevTools は、裏の処理（service worker）が Electron にない Chrome の機能を使って起動しないので入れない（Electron 45 で確かめた）
 */
export const KNOWN_EXTENSIONS = {
  "react-devtools": { id: "fmkadmapgofadopljbjfkapdkoienihi", name: "React Developer Tools", description: "React のコンポーネントと props・state を見る" },
  "vue-devtools": { id: "nhdogjmejiglipccpnnnanhbledajbpd", name: "Vue.js devtools", description: "Vue のコンポーネント・Pinia・ルーターを見る" },
  "redux-devtools": { id: "lmhkpmbekcpmknklioeibfkpmmfibljd", name: "Redux DevTools", description: "Redux の action と state の移り変わりを追う" },
  "svelte-devtools": { id: "kfidecgcdjjfpeckbblhmfkhmlgecoff", name: "Svelte DevTools", description: "Svelte のコンポーネントと状態を見る" },
  "apollo-devtools": { id: "jdkknkkbebbapilgoeccciglkfbmbnfm", name: "Apollo Client Devtools", description: "GraphQL のクエリと Apollo のキャッシュを見る" },
} as const;

export type KnownExtensionKey = keyof typeof KNOWN_EXTENSIONS;

export const KNOWN_EXTENSION_KEYS = Object.keys(KNOWN_EXTENSIONS) as KnownExtensionKey[];
