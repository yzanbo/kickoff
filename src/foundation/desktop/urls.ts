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
