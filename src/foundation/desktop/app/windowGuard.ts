import type { WebContents } from "electron";
import { appNavigationAllowed, frameNavigationAllowed } from "@/foundation/desktop/urls";

/**
 * アプリの窓（メインのウィンドウと別ウィンドウ）は、新しいウィンドウの要求（target="_blank" のリンク・window.open・中クリック）では何も開かない。
 * 外のページは、画面が確認を通してから（本文のリンク）か、アプリが作った URL を、IPC の externalApps.openWebUrl で開く
 * （要求をそのまま既定のブラウザに渡すと、確認を通らないリンクが外へ出る）
 */
export function denyNewWindows(contents: WebContents) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}

/**
 * アプリの窓が、アプリの出どころの外へ移らないようにする（窓の中のリンク・location の書き換え・転送・枠の中の移動）。
 * 外のページへ移ると、そのページがアプリの窓の権限（defaultSession の許可）で動くため。同じ出どころの中の移動・hash の移動（ルーター）は止めない。
 * 埋め込みブラウザ（webview）は別の WebContents なので、ここでは扱わない。appUrl: いまのアプリの URL（開発版は dev サーバー）
 */
export function guardAppNavigation(contents: WebContents, appUrl: () => string | undefined) {
  contents.on("will-navigate", (e) => {
    if (!appNavigationAllowed(e.url, appUrl())) e.preventDefault();
  });
  contents.on("will-redirect", (e) => {
    if (!appNavigationAllowed(e.url, appUrl())) e.preventDefault();
  });
  // 枠（iframe）の中の移動。図の枠のスクリプト・HTML の文書のリンクが、枠ごと外のページへ移らないように
  contents.on("will-frame-navigate", (e) => {
    if (!e.isMainFrame && !frameNavigationAllowed(e.url, appUrl())) e.preventDefault();
  });
}
