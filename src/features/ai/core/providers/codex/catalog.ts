import type { ModelOption } from "@shared/chat/types";
import { EFFORT_LEVELS, type EffortLevel } from "@shared/settings/types";
import { limitReachedOf, type SpendingNote } from "@shared/ai/usage";
import type { AskModel } from "@/features/ai/core/providers/types";
import type { CodexModel, RateLimitSnapshot, RateLimitWindow } from "./protocol";
import { creditBalanceOf } from "./usage";

/** Codex の答え（モデルの一覧・実行中の使用枠の知らせ）を Kickoff の形にする（純粋関数） */

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

/**
 * 実行中の使用枠の知らせ（account/rateLimits/updated）から、クレジットの様子。知らせは一部だけのことがあり、
 * 書いていない項目は null（前の値のまま）。クレジットも枠も書いていなければ null（何も知らせない）
 */
export function creditsNoteOf(snapshot: RateLimitSnapshot | null | undefined): SpendingNote | null {
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
