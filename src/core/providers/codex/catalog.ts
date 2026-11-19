import { EFFORT_LEVELS, PROVIDER_LABELS, type EffortLevel, type ModelOption, type PlanUsage, type UsageWindow } from "@shared/types";
import { creditBalanceOf, limitReachedOf } from "../../usage/codexCredits.js";
import type { AskModel, CreditsNote } from "../types.js";
import type { CodexModel, RateLimitSnapshot, RateLimitWindow, RateLimitsResponse } from "./protocol.js";

/** Codex の答え（モデルの一覧・使用枠）を Kickoff の形にする（純粋関数） */

const isEffort = (value: string): value is EffortLevel => (EFFORT_LEVELS as readonly string[]).includes(value);

/** チャット欄のモデルの一覧（隠すものは除く。ファストモードは Codex の速さの段の名前を確かめるまで出さない） */
export function toModelOptions(models: CodexModel[]): ModelOption[] {
  return models
    .filter((m) => !m.hidden)
    .map((m) => ({
      value: m.model,
      label: m.displayName || m.model,
      description: m.description,
      efforts: m.supportedReasoningEfforts.map((e) => e.reasoningEffort).filter(isEffort),
      ...(m.defaultReasoningEffort ? { default_effort: m.defaultReasoningEffort } : {}),
      supports_auto_mode: true,
      supports_fast_mode: false,
      ...(m.isDefault ? { is_default: true } : {}),
    }));
}

/**
 * 1 回だけ聞くとき（ask）のモデルと深さ。名前を決め打ちせず、一覧から選ぶ: standard = 既定のモデル、light = 軽いモデル（名前に mini の付くもの、
 * なければ説明が速い・安いと言うもの（gpt-6-luna の「Fast and affordable」など）。どちらもなければ既定）を浅く。
 * 一覧の先にあるほど新しいので、最初に当たったものを使う。一覧が取れなければ Codex の既定（null）
 */
export function askModelOf(models: CodexModel[], tier: AskModel): { model: string | null; effort: string } {
  const visible = models.filter((m) => !m.hidden);
  const standard = visible.find((m) => m.isDefault) ?? visible[0];
  if (tier === "standard") return { model: standard?.model ?? null, effort: "medium" };
  const light = visible.find((m) => /mini/i.test(m.model)) ?? visible.find((m) => /\b(fast|affordable|lightweight)\b/i.test(m.description)) ?? standard;
  return { model: light?.model ?? null, effort: "low" };
}

const resetIso = (w: RateLimitWindow | null) => (w?.resetsAt ? new Date(w.resetsAt * 1000).toISOString() : null);
const windowOf = (key: string, label: string, w: RateLimitWindow | null): UsageWindow => ({ key, label, utilization: w ? w.usedPercent : null, resets_at: resetIso(w) });

/** 使用枠（account/rateLimits/read）。短い枠（5 時間）と長い枠（週）を、長さで見分ける */
export function toPlanUsage(res: RateLimitsResponse, now = new Date()): PlanUsage {
  const windows = [res.rateLimits.primary, res.rateLimits.secondary].filter((w): w is RateLimitWindow => w !== null);
  const byLength = [...windows].sort((a, b) => (a.windowDurationMins ?? 0) - (b.windowDurationMins ?? 0));
  const short = byLength.length > 1 ? byLength[0] : byLength[0] && (byLength[0].windowDurationMins ?? 0) <= 300 ? byLength[0] : null;
  const long = byLength.find((w) => w !== short) ?? null;
  return {
    provider: "codex",
    provider_label: PROVIDER_LABELS.codex,
    available: windows.length > 0,
    plan: res.rateLimits.planType,
    five_hour: windowOf("five_hour", "5 時間", short),
    seven_day: windowOf("seven_day", "週", long),
    model_weekly: [],
    fetched_at: now.toISOString(),
  };
}

/**
 * 実行中の使用枠の知らせ（account/rateLimits/updated）から、クレジットの様子。知らせは一部だけのことがあり、
 * 書いていない項目は null（前の値のまま）。クレジットも枠も書いていなければ null（何も知らせない）
 */
export function creditsNoteOf(snapshot: RateLimitSnapshot | null | undefined): CreditsNote | null {
  if (!snapshot) return null;
  const credits = snapshot.credits ?? null;
  const windows = [snapshot.primary, snapshot.secondary].filter((w): w is RateLimitWindow => w !== null && w !== undefined);
  const limit = limitReachedOf(windows.map((w) => w.usedPercent));
  if (!credits && limit === null) return null;
  return {
    has_credits: credits?.hasCredits ?? null,
    unlimited: credits?.unlimited ?? null,
    balance: creditBalanceOf(credits?.balance),
    limit_reached: limit,
  };
}
