import { app, session, shell, type Session, type WebContents } from "electron";
import { webLinkOf } from "@shared/foundation/linkTarget";
import { isEmbeddableUrl } from "@/foundation/desktop/urls";
import { sendEvent } from "@/foundation/desktop/ipc/register";
import { isBrowserFindKey } from "./keys";

// 埋め込みブラウザ（<webview>）のセッションと安全設定。開発者ツールは devtools.ts、拡張機能は extensions.ts

/** 頼んできた画面の中の埋め込みブラウザか */
export const isOurWebview = (host: WebContents, c: WebContents | undefined): c is WebContents => Boolean(c && c.getType() === "webview" && c.hostWebContents === host);

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
    contents.on("did-attach-webview", (_event, guest) => {
      // ページの中にピントがあると、外の画面の keydown には届かない。開発者ツールは自分の検索に任せる
      guest.on("before-input-event", (event, input) => {
        if (!isBrowserFindKey(input) || guest.getURL().startsWith("devtools:")) return;
        event.preventDefault();
        if (!input.isAutoRepeat) sendEvent(contents, "browser", "onFindRequested", guest.id);
      });
    });
    if (contents.getType() === "webview") openPopupsExternally(contents);
  });
}

/**
 * 埋め込みブラウザの中の新しいウィンドウ（target="_blank" のリンク・window.open）は、窓を作らずに既定のブラウザで開く（URL を読み直し、http(s) だけ）。
 * アプリの窓は新しいウィンドウの要求では何も開かない（foundation の denyNewWindows）ので、webview の分はここで持つ
 */
function openPopupsExternally(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    const target = webLinkOf(url);
    if (target !== null) void shell.openExternal(target);
    return { action: "deny" };
  });
}
