import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AUTH_COOKIE = "kickoff_token";

/**
 * 本体のトークンを作り直した印のファイル。前の版の /pair?token= はスマホに本体のトークンを渡していたので、
 * 端末ごとのトークンにした版の最初の起動で一度だけ作り直し、そのとき配ったトークンを使えなくする（2026-11-14）
 */
const ROTATED_MARK = "token-rotated";

/** 本体のトークン（この Mac の画面だけが使う。保存先の token。初回起動時・作り直しの印がないときに作って保存する） */
export function loadOrCreateToken(dataDir: string): string {
  const file = path.join(dataDir, "token");
  const mark = path.join(dataDir, ROTATED_MARK);
  if (fs.existsSync(mark)) {
    try {
      const token = fs.readFileSync(file, "utf8").trim();
      if (token.length >= 32) return token;
    } catch {
      // 未作成
    }
  }
  const token = randomBytes(24).toString("base64url");
  fs.writeFileSync(file, token, { mode: 0o600 });
  fs.writeFileSync(mark, "", { mode: 0o600 });
  return token;
}

export function tokenMatches(expected: string, given: string | undefined | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
