// 使用状況の取り方の共有の小道具（HTTP・JWT・ログイン情報のファイル・結果の作り方。各 AI のフォルダの usage.ts が使う）
import { existsSync, readFileSync } from "node:fs";
import type { UsageWindow } from "@shared/ai/types";
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";

/** 各サービスへの問い合わせの待ち時間 */
const TIMEOUT_MS = 15_000;

/** JWT の中身（署名は確かめない。期限とメールアドレスを見るだけ） */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** JWT の期限（ミリ秒）。なければ null */
export function jwtExpiry(token: string): number | null {
  const exp = jwtClaims(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/** 期限が切れている（またはもうすぐ切れる）か */
export const isExpired = (expiresAt: number | null, marginMs = 60_000) => expiresAt !== null && expiresAt - marginMs <= Date.now();

/** JSON ファイルを読む（なければ null） */
export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** HTTP の失敗（状態コードつき） */
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`);
  }
}

/** 各サービスへの名乗り（User-Agent）。サービスが決まった名乗りを求めないときに使う */
export const USER_AGENT = "Kickoff";

/** JSON を取ってくる（Accept は JSON を既定にする。失敗は HttpStatusError） */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  if (!res.ok) throw new HttpStatusError(res.status, text.slice(0, 500));
  return JSON.parse(text) as T;
}

/** 使用率を 0〜100 にそろえる */
const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

/** 秒（UNIX 時刻）を ISO の文字列に */
export const isoFromSeconds = (s: unknown) => (typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null);

/** 日付（"2026-12-01" や ISO）を ISO の文字列に */
export function isoFromDate(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function usageWindow(key: string, label: string, utilization: number | null, resets_at: string | null, detail?: string): UsageWindow {
  return { key, label, utilization: utilization === null ? null : clampPercent(utilization), resets_at, ...(detail ? { detail } : {}) };
}

type Fields = Partial<Pick<ProviderUsage, "plan" | "account">>;

/** 1 つの AI の結果の作り方（ok / unavailable / error を同じ形で作る） */
export interface UsageResults {
  ok(fields: Partial<Omit<ProviderUsage, "provider" | "status" | "fetched_at">>): ProviderUsage;
  /** 見られない（未ログイン・未契約など）。message に見る方法を書く */
  unavailable(message: string, fields?: Fields): ProviderUsage;
  /** 取得に失敗した（message に理由） */
  error(message: string, fields?: Fields): ProviderUsage;
}

export function usageResult(provider: ProviderId): UsageResults {
  const empty = () => ({ provider, plan: null, account: null, windows: [], notes: [], pay_as_you_go: null });
  return {
    ok: (fields) => ({ ...empty(), status: "ok", ...fields, fetched_at: new Date().toISOString() }),
    unavailable: (message, fields = {}) => ({ ...empty(), status: "unavailable", ...fields, message, fetched_at: new Date().toISOString() }),
    error: (message, fields = {}) => ({ ...empty(), status: "error", ...fields, message, fetched_at: new Date().toISOString() }),
  };
}

/** メールアドレス（JWT の中身などから。なければ null） */
export const emailOf = (claims: Record<string, unknown> | null | undefined): string | null => (typeof claims?.email === "string" ? claims.email : null);

/**
 * JSON を取って parse で結果にする。状態コードが onStatus にある HTTP の失敗は、その結果にする（ログイン切れ・契約なしなど）。
 * ほかの失敗はそのまま投げる（呼び出し側で error にする）
 */
export async function fetchJsonOr<T, R>(url: string, init: RequestInit, parse: (body: T) => R, onStatus: Record<number, () => R>): Promise<R> {
  let body: T;
  try {
    body = await fetchJson<T>(url, init);
  } catch (e) {
    const fallback = e instanceof HttpStatusError ? onStatus[e.status] : undefined;
    if (!fallback) throw e;
    return fallback();
  }
  return parse(body);
}
