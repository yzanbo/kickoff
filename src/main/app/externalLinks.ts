import { shell, type WebContents } from "electron";
import { isWebUrl } from "./urls.js";

/**
 * 新しいウィンドウを開こうとしたら（target="_blank" のリンク・window.open）、http(s) のページだけ既定のブラウザで開き、
 * ウィンドウは作らない（メインのウィンドウの PR の URL など・埋め込みブラウザの中のリンクで共通）
 */
export function openLinksExternally(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}
