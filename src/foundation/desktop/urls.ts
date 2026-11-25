// URL の判定（外で開いてよいページ・出どころ）。Electron に依らないので、テストできる

/** http(s) のページか（外部のブラウザ・既定のブラウザで開いてよいもの） */
export const isWebUrl = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//.test(url);

/** 埋め込みブラウザ（<webview>）で開いてよいページか（http(s) と空のページ） */
export const isEmbeddableUrl = (url: string) => /^(https?:|about:blank)/.test(url);

/** 同じ出どころ（スキーム・ホスト・ポート）か。URL として読めなければ違うものとする */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * アプリの窓の移動を通してよいか。アプリの出どころ（製品版はコアの URL、開発版は electron-vite の dev サーバーの URL）の中だけ。
 * appUrl がまだ分からなければ通さない（閉じる側に倒す）
 */
export function appNavigationAllowed(url: string, appUrl: string | undefined): boolean {
  return appUrl !== undefined && sameOrigin(url, appUrl);
}

/** アプリの窓の中の枠（iframe）の移動を通してよいか。アプリの出どころと、srcdoc・空のページ（HTML の文書の iframe）だけ */
export function frameNavigationAllowed(url: string, appUrl: string | undefined): boolean {
  return url === "about:srcdoc" || url === "about:blank" || appNavigationAllowed(url, appUrl);
}
