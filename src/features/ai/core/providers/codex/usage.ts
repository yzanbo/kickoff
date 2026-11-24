import type { PayAsYouGo, ProviderUsage } from "@shared/ai/usage";
import { isoFromSeconds, usageResult, usageWindow } from "@/features/ai/core/providers/shared/http";
import type { Account, RateLimitSnapshot } from "./protocol";

const result = usageResult("codex");

/** クレジットの残り（app-server は数の文字で返す）。読めなければ null */
export function creditBalanceOf(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** 長さが分からない枠は、5 時間や週と決めつけない */
function windowLabel(minutes: number | null, fallback: string): string {
  if (!minutes || minutes < 0) return fallback;
  if (minutes === 10_080) return "週";
  if (minutes % 1_440 === 0) return `${minutes / 1_440}日`;
  if (minutes % 60 === 0) return `${minutes / 60}時間`;
  return `${minutes}分`;
}

export function noCodexUsage(account: Exclude<Account, { type: "chatgpt" }> | null): ProviderUsage {
  if (!account) return result.unavailable("Codex にログインしていません（設定の「接続」からログインしてください）");
  if (account.type === "apiKey") return result.unavailable("API キーで使っているため、プランの使用枠はありません");
  return result.unavailable("この接続方法では ChatGPT の使用枠を取得できません");
}

/** app-server の互換用単一枠だけを表示する。枠のリセット用クレジットと残高は別物 */
export function normalizeCodexUsage(limits: RateLimitSnapshot, account: Extract<Account, { type: "chatgpt" }>): ProviderUsage {
  const windows = [
    ["primary", limits.primary, "主枠"],
    ["secondary", limits.secondary, "追加枠"],
  ] as const;
  const notes: string[] = [];
  const raw = limits.credits;
  const balance = creditBalanceOf(raw?.balance);
  if (raw?.unlimited) notes.push("クレジット: 無制限");
  else if (raw?.hasCredits && balance !== null) notes.push(`クレジット残り ${balance}`);
  // 支払いの様子は実行中の知らせと取得した残高から、見張りが重ねる
  const credits: PayAsYouGo | null = raw
    ? { enabled: raw.hasCredits, unlimited: raw.unlimited, balance, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null }
    : null;
  return result.ok({
    plan: limits.planType ?? account.planType,
    account: account.email,
    windows: windows.flatMap(([key, window, fallback]) =>
      window ? [usageWindow(key, windowLabel(window.windowDurationMins, fallback), window.usedPercent, isoFromSeconds(window.resetsAt))] : [],
    ),
    notes,
    pay_as_you_go: credits,
  });
}
