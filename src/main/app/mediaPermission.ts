import type { Session } from "electron";
import { sameOrigin } from "./urls.js";

// アプリ自身の画面のマイクの許可（チャット欄の音声入力）。埋め込みブラウザの webview は別のセッション（browser.ts）なので、ここでは扱わない

/**
 * 許可の問い合わせへの答え。media（マイク・カメラ）はアプリ自身の画面からの音声だけ許し、カメラ・ほかの出どころは断る。
 * media 以外は、これまでどおり許す（Electron の既定。通知・クリップボードなどを壊さない）
 */
export function permissionAllowed(req: { permission: string; requestingUrl: string; appUrl: string; mediaTypes?: readonly string[] }): boolean {
  if (req.permission !== "media") return true;
  if (!sameOrigin(req.requestingUrl, req.appUrl)) return false;
  const types = req.mediaTypes ?? [];
  return types.length > 0 && types.every((t) => t === "audio");
}

/** 確かめ（navigator.permissions・デバイスの一覧など）への答え。media はアプリ自身の画面から、カメラ以外を許す */
export function permissionCheckAllowed(req: { permission: string; requestingOrigin: string; appUrl: string; mediaType?: string }): boolean {
  if (req.permission !== "media") return true;
  return sameOrigin(req.requestingOrigin, req.appUrl) && req.mediaType !== "video";
}

/** Kickoff の画面のセッション（defaultSession）に、マイクの許可の答え方を登録する */
export function allowAppMicrophone(session: Session, appUrl: string) {
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents?.getURL() || "";
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    callback(permissionAllowed({ permission, requestingUrl, appUrl, mediaTypes }));
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    permissionCheckAllowed({ permission, requestingOrigin, appUrl, mediaType: "mediaType" in details ? details.mediaType : undefined }),
  );
}
