// Claude のプランの使用枠の取り方（/usage と同じもの。送らないセッションを一瞬開くだけで、使用枠を消費しない）
import { planUsageOf, resolveClaudeExecutable, type SDKControlGetUsageResponse } from "./wire";
import { readFile } from "node:fs/promises";
import type { UsageWindow } from "@shared/ai/types";
import type { PayAsYouGo, ProviderUsage } from "@shared/ai/usage";
import { claudeConfigPath } from "./internals";
import { realClaudeSdk } from "./sdk";
import { withIdleSession, type IdleSessionDeps } from "./idleSession";

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

/** SDK の /usage 応答を Kickoff の形に変換する（planDisplayName があれば、プランは種類ではなく表示名にする。枠は 5 時間・週・モデル別の週の順） */
export function normalizeUsage(res: SDKControlGetUsageResponse, planDisplayName: string | null = null): ProviderUsage {
  const limits = res.rate_limits;
  const win = (key: string, label: string, raw: RawWindow): UsageWindow => ({
    key,
    label,
    utilization: raw?.utilization ?? null,
    resets_at: raw?.resets_at ?? null,
  });
  return {
    provider: "claude",
    status: res.rate_limits_available && limits !== null ? "ok" : "unavailable",
    // API キーなどでプランがないときは表示名も使わない
    plan: res.subscription_type ? (planDisplayName ?? res.subscription_type) : null,
    account: null,
    windows: [
      win("five_hour", "5時間", limits?.five_hour),
      win("seven_day", "週", limits?.seven_day),
      ...(limits?.model_scoped ?? []).map((m) => win(`model:${m.display_name}`, `週（${m.display_name}）`, m)),
    ],
    notes: [],
    pay_as_you_go: limits?.extra_usage ? extraUsageOf(limits.extra_usage) : null,
    fetched_at: new Date().toISOString(),
  };
}

type RawExtraUsage = NonNullable<NonNullable<SDKControlGetUsageResponse["rate_limits"]>["extra_usage"]>;

/** 追加の使用枠（金額は通貨の最小単位のまま。USD ならセント。いま引かれているかは実行中の知らせで見張りが重ねる） */
function extraUsageOf(raw: RawExtraUsage): PayAsYouGo {
  return {
    enabled: raw.is_enabled,
    unlimited: false,
    balance: null,
    utilization: raw.utilization,
    used: raw.used_credits,
    limit: raw.monthly_limit,
    currency: raw.currency ?? null,
    spending: null,
    checked_at: null,
  };
}

/**
 * プランの使用枠を取る（使用状況の見張りが 1 分ごとと実行のあとに呼ぶ）。
 * 注意: SDK 側で EXPERIMENTAL 扱いの API。形が変わったら normalizeUsage を直す
 */
export async function fetchClaudeUsage(deps: IdleSessionDeps = { query: realClaudeSdk.query, executable: resolveClaudeExecutable() }): Promise<ProviderUsage> {
  return withIdleSession(deps, async (q) => normalizeUsage(await planUsageOf(q), await readPlanDisplayName()));
}
