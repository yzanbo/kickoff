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

/** 枠（iframe）の移動の様子（Electron の will-frame-navigate から。Electron に依らない形） */
export interface FrameNavigation {
  /** 移り先 */
  url: string;
  /** 移る枠のいまの URL（作ったばかりの枠は空か about:blank） */
  current: string;
  /** 枠の親がアプリの画面の文書そのものか（枠の中の枠でないか） */
  inAppDocument: boolean;
  /** 移動を始めたのがアプリの画面の文書か（枠の中のスクリプト・リンクでないか） */
  byAppDocument: boolean;
}

/** 通信しない文書（HTML の文書を入れる srcdoc・空のページ） */
const LOCAL_DOCUMENTS: ReadonlySet<string> = new Set(["about:srcdoc", "about:blank"]);

/**
 * アプリの窓の中の枠（iframe）の移動を通してよいか。
 * - srcdoc・空のページは、まだ何も読んでいない枠か、srcdoc・空のページの枠だけ（HTML のノート・ファイルのプレビューの srcdoc の入れ替え）
 * - アプリの出どころのページ（閉じた枠のページ /visual-frame・/mermaid-frame）は、アプリの画面の文書が自分で作った枠の最初の読み込みだけ
 * 一度アプリの出どころのページを読んだ枠は、どこへも移れず読み込み直せない（乗っ取られた閉じた枠が /api など Cookie の付く GET へ移らないように）。
 * 枠の中の枠は、通信しない文書のほかへは移れない。外のページ・data: などはいつも止める
 */
export function frameNavigationAllowed(nav: FrameNavigation, appUrl: string | undefined): boolean {
  const fresh = nav.current === "" || nav.current === "about:blank";
  if (LOCAL_DOCUMENTS.has(nav.url)) return fresh || LOCAL_DOCUMENTS.has(nav.current);
  return fresh && nav.inAppDocument && nav.byAppDocument && appNavigationAllowed(nav.url, appUrl);
}
