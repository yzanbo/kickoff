import type { UsageWindow } from "@shared/ai/types";
import type { ProviderUsage } from "@shared/ai/usage";
import { isoFromDate, usageResult, usageWindow } from "@/features/ai/core/providers/shared/usage";
import type { CopilotQuota } from "./sdk";

const result = usageResult("copilot");
const QUOTAS = [
  ["premium_interactions", "プレミアムリクエスト"],
  ["chat", "チャット"],
  ["completions", "コード補完"],
] as const;

export function noCopilotLogin(): ProviderUsage {
  return result.unavailable("Copilot にログインしていません。Copilot CLI でログインしてください。");
}

const count = (n: number) => Number.isFinite(n) && n >= 0;

/** SDK が返した回数をそのまま使う。無制限や未知の枠を、月の使用回数に見立てない */
export function normalizeCopilotUsage(body: CopilotQuota, account: string | null): ProviderUsage {
  const windows: UsageWindow[] = [];
  const notes: string[] = [];
  for (const [key, label] of QUOTAS) {
    const quota = body.quotaSnapshots?.[key];
    if (!quota) continue;
    if (quota.isUnlimitedEntitlement || quota.entitlementRequests === -1) {
      notes.push(label + ": 無制限");
      continue;
    }
    const percent = Number.isFinite(quota.remainingPercentage) ? 100 - quota.remainingPercentage : null;
    const detail = count(quota.usedRequests) && count(quota.entitlementRequests) ? quota.usedRequests + " / " + quota.entitlementRequests + " 回" : undefined;
    const reset = isoFromDate(quota.resetDate);
    if (percent === null && detail === undefined && reset === null) continue;
    windows.push(usageWindow(key, label + "（月）", percent, reset, detail));
  }
  if (windows.length === 0 && notes.length === 0) return result.unavailable("このアカウントの使用枠を Copilot SDK から取得できませんでした。", { account });
  return result.ok({ account, windows, notes });
}
