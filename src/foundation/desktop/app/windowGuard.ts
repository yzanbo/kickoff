import type { WebContents } from "electron";

/**
 * アプリの窓（メインのウィンドウと別ウィンドウ）は、新しいウィンドウの要求（target="_blank" のリンク・window.open・中クリック）では何も開かない。
 * 外のページは、画面が確認を通してから（本文のリンク）か、アプリが作った URL を、IPC の externalApps.openWebUrl で開く
 * （要求をそのまま既定のブラウザに渡すと、確認を通らないリンクが外へ出る）
 */
export function denyNewWindows(contents: WebContents) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}
