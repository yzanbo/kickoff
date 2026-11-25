import type { Session } from "electron";
import { sameOrigin } from "@/foundation/desktop/urls";

// アプリ自身の画面の許可（チャット欄の音声入力のマイク・通知・クリップボードなど）。埋め込みブラウザの webview は別のセッション（browser.ts）なので、ここでは扱わない

/**
 * 許可の問い合わせへの答え。アプリの出どころからのものだけを許す（窓が外のページへ移っても、そのページに権限を渡さない。移動は windowGuard.ts でも止める）。
 * media（マイク・カメラ）はアプリ自身の画面からの音声だけ許し、カメラは断る。ほか（通知・クリップボードなど）はアプリの画面なら許す（Electron の既定と同じ）
 */
export function permissionAllowed(req: { permission: string; requestingUrl: string; appUrl: string; mediaTypes?: readonly string[] }): boolean {
  if (!sameOrigin(req.requestingUrl, req.appUrl)) return false;
  if (req.permission !== "media") return true;
  const types = req.mediaTypes ?? [];
  return types.length > 0 && types.every((t) => t === "audio");
}

/** 確かめ（navigator.permissions・デバイスの一覧など）への答え。アプリの出どころからのものだけ。media はカメラ以外を許す */
export function permissionCheckAllowed(req: { permission: string; requestingOrigin: string; appUrl: string; mediaType?: string }): boolean {
  if (!sameOrigin(req.requestingOrigin, req.appUrl)) return false;
  return req.permission !== "media" || req.mediaType !== "video";
}

/** Kickoff の画面のセッション（defaultSession）に、許可の答え方を登録する */
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
