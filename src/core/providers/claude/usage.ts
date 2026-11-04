import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PlanUsage, UsageWindow } from "@shared/types";

/** Claude Code の設定ファイル（ログインしているアカウントの情報が入る。CLAUDE_CONFIG_DIR があればその中） */
export const claudeConfigPath = (): string => join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json");

/** プランの表示名として受け付ける形（Claude Code と同じ。英数字・空白・. + - で 40 文字まで） */
const PLAN_DISPLAY_NAME = /^[\p{L}\p{N}](?:[\p{L}\p{N} .+-]{0,38}[\p{L}\p{N}+])?$/u;

/**
 * ログインしているアカウントのプランの表示名（"Ultra"・"Max 20x" など。分からなければ null）。
 * 種類（subscription_type）は Max の段階（Ultra・20x・5x）を区別せずどれも "max" になるので、Claude Code が
 * アカウントの情報から覚えている表示名（設定ファイルの oauthAccount.planDisplayName）を読む。読むだけで書き換えない
 */
export async function readPlanDisplayName(path = claudeConfigPath()): Promise<string | null> {
  try {
    const config = JSON.parse(await readFile(path, "utf8")) as { oauthAccount?: { planDisplayName?: unknown } };
    const name = config.oauthAccount?.planDisplayName;
    return typeof name === "string" && PLAN_DISPLAY_NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

type RawWindow = { utilization: number | null; resets_at: string | null } | null | undefined;

/** SDK の /usage 応答を Kickoff の形に変換する（planDisplayName があれば、プランは種類ではなく表示名にする） */
export function normalizeUsage(res: SDKControlGetUsageResponse, planDisplayName: string | null = null): PlanUsage {
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
    // API キーなどでプランがないときは表示名も使わない
    plan: res.subscription_type ? (planDisplayName ?? res.subscription_type) : null,
    five_hour: win("five_hour", "5時間", limits?.five_hour),
    seven_day: win("seven_day", "週", limits?.seven_day),
    model_weekly: (limits?.model_scoped ?? []).map((m) => win(`model:${m.display_name}`, `週（${m.display_name}）`, m)),
    extra_usage: limits?.extra_usage ? { enabled: limits.extra_usage.is_enabled, utilization: limits.extra_usage.utilization } : null,
    fetched_at: new Date().toISOString(),
  };
}
