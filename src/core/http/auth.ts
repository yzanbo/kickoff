import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AUTH_COOKIE = "kickoff_token";

/** 本体のトークン（この Mac の画面だけが使う。保存先の token。32 文字以上のものがなければ作って保存する） */
export function loadOrCreateToken(dataDir: string): string {
  const file = path.join(dataDir, "token");
  try {
    const token = fs.readFileSync(file, "utf8").trim();
    if (token.length >= 32) return token;
  } catch {
    // 未作成
  }
  const token = randomBytes(24).toString("base64url");
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

export function tokenMatches(expected: string, given: string | undefined | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
