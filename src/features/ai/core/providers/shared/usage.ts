// 各 AI の使用状況を共通の形にする小道具
import type { UsageWindow } from "@shared/ai/types";
import type { ProviderUsage } from "@shared/ai/usage";
import type { ProviderId } from "@shared/settings/types";

/** 使用枠は下の帯でも定期的に取るので、止まった CLI・SDK を待ち続けない */
export const USAGE_QUERY_TIMEOUT_MS = 8_000;

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

/** 1 つの AI の結果の作り方（通信や CLI の失敗は UsageMonitor がまとめて扱う） */
export interface UsageResults {
  ok(fields: Partial<Omit<ProviderUsage, "provider" | "status" | "fetched_at">>): ProviderUsage;
  /** 見られない（未ログイン・未契約など）。message に見る方法を書く */
  unavailable(message: string, fields?: Fields): ProviderUsage;
}

export function usageResult(provider: ProviderId): UsageResults {
  const empty = () => ({ provider, plan: null, account: null, windows: [], notes: [], pay_as_you_go: null });
  return {
    ok: (fields) => ({ ...empty(), status: "ok", ...fields, fetched_at: new Date().toISOString() }),
    unavailable: (message, fields = {}) => ({ ...empty(), status: "unavailable", ...fields, message, fetched_at: new Date().toISOString() }),
  };
}
