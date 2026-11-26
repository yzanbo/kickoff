import type { WebContents, WebContentsWillFrameNavigateEventParams } from "electron";
import { appNavigationAllowed, frameNavigationAllowed, type FrameNavigation } from "@/foundation/desktop/urls";

/** アプリの画面の文書（窓の一番上の枠）か */
const isTop = (frame: { parent: unknown } | null | undefined) => frame != null && frame.parent === null;

/** Electron の枠の移動の知らせを、判定の形にする（枠が消えていて読めなければ、止める側の形） */
function frameNavigationOf(e: WebContentsWillFrameNavigateEventParams): FrameNavigation {
  try {
    const frame = e.frame;
    return { url: e.url, current: frame?.url ?? "-", inAppDocument: isTop(frame?.parent), byAppDocument: isTop(e.initiator) };
  } catch {
    return { url: e.url, current: "-", inAppDocument: false, byAppDocument: false };
  }
}

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
  // 枠（iframe）の移動。閉じた枠・HTML の文書の中から、枠ごと外のページ・アプリの出どころのほかのパスへ移らないように（urls.ts）
  contents.on("will-frame-navigate", (e) => {
    if (e.isMainFrame) return;
    if (!frameNavigationAllowed(frameNavigationOf(e), appUrl())) e.preventDefault();
  });
}
