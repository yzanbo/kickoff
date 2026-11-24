// 公式の配布情報を読む HTTP と、各 AI の使用状況を共通の形にする小道具
import type { UsageWindow } from "@shared/ai/types";
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";

/** 各サービスへの問い合わせの待ち時間 */
const TIMEOUT_MS = 15_000;

/** 使用枠は下の帯でも定期的に取るので、止まった CLI・SDK を待ち続けない */
export const USAGE_QUERY_TIMEOUT_MS = 8_000;

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
export function isoFromSeconds(s: number | null): string | null {
  if (s === null || s <= 0) return null;
  const date = new Date(s * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** 日付（"2026-12-01" や ISO）を ISO の文字列に */
export function isoFromDate(s: unknown): string | null {
  if (typeof s !== "string" || !s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function usageWindow(key: string, label: string, utilization: number | null, resets_at: string | null, detail?: string): UsageWindow {
  return { key, label, utilization: utilization !== null && Number.isFinite(utilization) ? clampPercent(utilization) : null, resets_at, ...(detail ? { detail } : {}) };
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
