import { session } from "electron";
import { AUTH_COOKIE } from "../../core/http/auth.js";
import { allowAppMicrophone } from "./mediaPermission.js";

/** 認証の Cookie の有効期限（秒） */
const COOKIE_LIFETIME_SEC = 60 * 60 * 24 * 365;

/**
 * Kickoff の画面のセッション（defaultSession）を整える: 画面から API を呼ぶための認証の Cookie（トークンを画面のコードに渡さない）と、
 * チャット欄の音声入力のマイクの許可（Kickoff の画面からのものだけ。埋め込みブラウザは別のセッションなので広げない）
 */
export async function prepareAppSession(uiUrl: string, token: string) {
  await session.defaultSession.cookies.set({
    url: uiUrl,
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    expirationDate: Math.floor(Date.now() / 1000) + COOKIE_LIFETIME_SEC,
  });
  allowAppMicrophone(session.defaultSession, uiUrl);
}
