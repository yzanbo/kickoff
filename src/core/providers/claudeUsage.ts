import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type { PlanUsage, UsageWindow } from "../types.js";

type RawWindow = { utilization: number | null; resets_at: string | null } | null | undefined;

/** SDK の /usage 応答を Kickoff の形に変換する */
export function normalizeUsage(res: SDKControlGetUsageResponse): PlanUsage {
  const limits = res.rate_limits;
  const win = (key: string, label: string, raw: RawWindow): UsageWindow => ({
    key,
    label,
    utilization: raw?.utilization ?? null,
    resets_at: raw?.resets_at ?? null,
  });
  return {
    provider: "claude",
    provider_label: "Claude",
    available: res.rate_limits_available && limits !== null,
    plan: res.subscription_type,
    five_hour: win("five_hour", "5時間", limits?.five_hour),
    seven_day: win("seven_day", "週", limits?.seven_day),
    model_weekly: (limits?.model_scoped ?? []).map((m) => win(`model:${m.display_name}`, `週（${m.display_name}）`, m)),
    extra_usage: limits?.extra_usage ? { enabled: limits.extra_usage.is_enabled, utilization: limits.extra_usage.utilization } : null,
    fetched_at: new Date().toISOString(),
  };
}
