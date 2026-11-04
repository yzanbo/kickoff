import { app, session, type Session, type WebContents } from "electron";
import { openLinksExternally } from "../app/externalLinks.js";
import { isEmbeddableUrl } from "../app/urls.js";

// 埋め込みブラウザ（<webview>）のセッションと安全設定。開発者ツールは devtools.ts、拡張機能は extensions.ts

/** 埋め込みブラウザ用のセッション（ログイン状態は保持するが、Kickoff 本体とは分ける） */
const BROWSER_PARTITION = "persist:kickoff-browser";

/** 埋め込みブラウザのセッション（拡張機能はここに読み込む） */
export const browserSession = (): Session => session.fromPartition(BROWSER_PARTITION);

/**
 * 埋め込みブラウザ（<webview>）の安全設定。表示するページは信頼しない外部コンテンツとして扱う:
 * Node.js を使わせない、preload を差し込ませない、http(s) 以外は開かない、専用のセッションに限る。
 */
export function hardenWebviews() {
  app.on("web-contents-created", (_e, contents: WebContents) => {
    contents.on("will-attach-webview", (event, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      params.partition = BROWSER_PARTITION;
      if (params.src && !isEmbeddableUrl(params.src)) event.preventDefault();
    });
    // 埋め込みブラウザ内の新しいウィンドウは、外部のブラウザで開く
    if (contents.getType() === "webview") openLinksExternally(contents);
  });
}
