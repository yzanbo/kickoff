// 認証: 本体のトークン（この Mac の画面の Cookie）・端末のトークン（devices が DeviceAuth で引く）・ブラウザの一度だけのログイン
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Hono, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEVICE_FORBIDDEN, DEVICE_READ_ONLY, MOBILE_OFF, MOBILE_OFF_MESSAGE } from "@shared/types";
import { systemClock, type Clock } from "@/foundation/core/clock";
import { setCaller, type Caller } from "./caller";
import { deviceMayUse } from "./deviceAccess";

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

/** 端末のトークンを呼び主にする（devices が実装して組み立てが渡す） */
export interface DeviceAuth {
  /** トークンが端末のものなら呼び主。スマホ連携がオフなら "mobile_off"。知らないトークンなら null */
  authenticate(token: string): Extract<Caller, { kind: "device" }> | "mobile_off" | null;
  /** 使った時刻を書く */
  touched(deviceId: number): void;
  /** この端末がまだ使えるか（取り消した・スマホ連携をオフにしたら false。SSE を切る判定） */
  alive(deviceId: number): boolean;
}

/**
 * /api/* の認証と呼び主: 本体のトークンならこの Mac、端末のトークンならその端末（caller.ts）。
 * 端末は deviceAccess.ts の口だけ（既定で閉じる。ほかは 403）。スマホ連携がオフなら、つないだ端末からの頼みも断る（登録は残す）
 */
export function authMiddleware(token: string, deviceAuth: DeviceAuth | undefined): MiddlewareHandler {
  return async (c, next) => {
    const given = [c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), getCookie(c, AUTH_COOKIE)].filter((t): t is string => Boolean(t));
    if (given.some((t) => tokenMatches(token, t))) {
      setCaller(c, { kind: "host" });
      return next();
    }
    const device = given.map((t) => deviceAuth?.authenticate(t) ?? null).find((d) => d !== null);
    if (!device) return c.json({ error: "unauthorized" }, 401);
    if (device === "mobile_off") return c.json({ error: MOBILE_OFF_MESSAGE, code: MOBILE_OFF }, 403);
    deviceAuth?.touched(device.deviceId);
    setCaller(c, device);
    const use = deviceMayUse(c.req.method, c.req.path, device.readOnly ? "read" : "full");
    if (use === "forbidden") return c.json({ error: "この操作は、この Mac の Kickoff からだけ使えます", code: DEVICE_FORBIDDEN }, 403);
    if (use === "read_only") return c.json({ error: "この端末は「見るだけ」です（Mac の Kickoff の設定の「スマホ連携」で変えられます）", code: DEVICE_READ_ONLY }, 403);
    return next();
  };
}

/** 番号が使える時間 */
const LOGIN_TTL_MS = 5 * 60_000;

/**
 * ブラウザからこの Mac の画面として入る、一度だけ使えるログイン（npm run daemon が端末に出す URL）。
 * URL に本体のトークンは入れず、使い捨ての番号と引き換えに本体のトークンの Cookie を置く（Mac のアプリの画面は Cookie を最初から持つので使わない）
 */
export class BrowserLogin {
  private readonly codes = new Map<string, number>();

  constructor(private readonly clock: Pick<Clock, "now"> = systemClock) {}

  /** 新しい番号を出す（一度だけ・5 分） */
  issue(): string {
    const code = randomBytes(24).toString("base64url");
    this.codes.set(code, this.clock.now() + LOGIN_TTL_MS);
    return code;
  }

  /** 番号を使う（使えたか。使ったら消す） */
  consume(code: string): boolean {
    const until = this.codes.get(code);
    this.codes.delete(code);
    for (const [c, t] of this.codes) if (t <= this.clock.now()) this.codes.delete(c);
    return until !== undefined && until > this.clock.now();
  }
}

/** /login?code=: 一度だけの番号で本体のトークンの Cookie を置いて画面へ */
export function loginRoute(app: Hono, token: string, browserLogin: BrowserLogin): void {
  app.get("/login", (c) => {
    if (!browserLogin.consume(c.req.query("code") ?? "")) return c.text("ログインの番号が正しくないか、期限が切れています。npm run daemon を起動し直すと、新しい URL を出します", 401);
    setCookie(c, AUTH_COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return c.redirect("/");
  });
}
