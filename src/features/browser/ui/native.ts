// メインプロセスの口（window.kickoff）のうち、埋め込みブラウザが使う所（ブラウザの画面で window.kickoff を触るのはここだけ）。
// どれも Mac のアプリでなければ undefined
type Native = NonNullable<Window["kickoff"]>;

/** Mac のアプリか（ブラウザで開いた画面では webview がない） */
export const isDesktopApp = (): boolean => Boolean(globalThis.window?.kickoff);

/** ブラウザのタブの口（ページ内検索の頼み・画像のコピー） */
export const nativeBrowserTab = (): Native["browser"] | undefined => globalThis.window?.kickoff?.browser;

/** 開発者ツールの口 */
export const nativeDevtools = (): Native["devtools"] | undefined => globalThis.window?.kickoff?.devtools;

/** AI のブラウザ操作の口（タブの登録・開く / 表に出すの頼み・「AI に渡す」の取り込み） */
export const nativeAgentBrowser = (): Native["agentBrowser"] | undefined => globalThis.window?.kickoff?.agentBrowser;

/** 拡張機能の口 */
export const nativeBrowserExtensions = (): Native["browserExtensions"] | undefined => globalThis.window?.kickoff?.browserExtensions;
