import { existsSync, readFileSync } from "node:fs";
import type { ServiceUsage, UsageServiceId, UsageWindow } from "../types.js";

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
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`);
  }
}

/** JSON を取ってくる（失敗は HttpStatusError） */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
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

/** 金額（セント）を "$3.20" に */
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function usageWindow(key: string, label: string, utilization: number | null, resets_at: string | null, detail?: string): UsageWindow {
  return { key, label, utilization: utilization === null ? null : clampPercent(utilization), resets_at, ...(detail ? { detail } : {}) };
}

type Base = Pick<ServiceUsage, "id" | "label">;

/** 1 つのサービスの結果の作り方（id・表示名を持ち、ok / unavailable / error を同じ形で作る） */
export interface UsageResults extends Base {
  ok(fields: Partial<Omit<ServiceUsage, "id" | "label" | "status" | "fetched_at">>): ServiceUsage;
  /** 見られない（未ログイン・未契約など）。message に見る方法を書く */
  unavailable(message: string, fields?: Partial<Pick<ServiceUsage, "plan" | "account">>): ServiceUsage;
  /** 取得に失敗した（message に理由） */
  error(message: string, fields?: Partial<Pick<ServiceUsage, "plan" | "account">>): ServiceUsage;
}

export function usageResult(base: Base): UsageResults {
  const empty = () => ({ ...base, plan: null, account: null, windows: [], notes: [] });
  return {
    ...base,
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

/** サービスの使用状況を取る関数 */
export interface UsageFetcher {
  id: UsageServiceId;
  label: string;
  fetch: () => Promise<ServiceUsage>;
}

/** 1 サービス 1 ファイルの fetcher（id・表示名は結果の作り方と同じもの） */
export const defineFetcher = ({ id, label }: Base, fetch: () => Promise<ServiceUsage>): UsageFetcher => ({ id, label, fetch });
