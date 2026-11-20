import type { PlanUsage } from "@shared/ai/types";
import type { ModelOption } from "@shared/chat/types";
import { EFFORT_LEVELS, PROVIDER_LABELS, type EffortLevel } from "@shared/settings/types";
import type { AskModel } from "@/features/ai/core/providers/types";
import type { CopilotQuotaSnapshot, ModelInfo } from "./sdk";

/** Copilot の答え（モデルの一覧・使用枠）を Kickoff の形にする（純粋関数） */

const isEffort = (value: string): value is EffortLevel => (EFFORT_LEVELS as readonly string[]).includes(value);
const usable = (m: ModelInfo) => m.policy?.state !== "disabled";

/** チャット欄のモデルの一覧（組織の決まりで切られたものは除く。ファストモードは Copilot にないので出さない） */
export function toModelOptions(models: ModelInfo[]): ModelOption[] {
  return models.filter(usable).map((m) => ({
    value: m.id,
    label: m.name || m.id,
    description: m.billing?.multiplier !== undefined ? `プレミアムリクエスト ×${m.billing.multiplier}` : "",
    efforts: (m.supportedReasoningEfforts ?? []).filter(isEffort),
    supports_auto_mode: true,
    supports_fast_mode: false,
  }));
}

/**
 * 1 回だけ聞くとき（ask）のモデル。名前を決め打ちせず、一覧の値段の倍率（billing.multiplier）で選ぶ: light = いちばん安いもの、
 * standard = 倍率 1 以下でいちばん高いもの（プレミアムリクエストを多く使わない）。一覧が取れなければ Copilot の既定（null）
 */
export function askModelOf(models: ModelInfo[], tier: AskModel): string | null {
  const priced = models.filter(usable).map((m) => ({ id: m.id, rate: m.billing?.multiplier ?? 1 }));
  if (priced.length === 0) return null;
  const byRate = [...priced].sort((a, b) => a.rate - b.rate);
  if (tier === "light") return byRate[0].id;
  return [...byRate].reverse().find((m) => m.rate <= 1)?.id ?? byRate[0].id;
}

/**
 * 使用枠（account.getQuota）。Copilot の枠は月ごとのプレミアムリクエスト（premium_interactions）なので、長い枠の欄に「月（プレミアム）」で出し、
 * 5 時間の欄は分からない（null）にする。無制限なら使った割合は 0
 */
export function toPlanUsage(snapshots: Record<string, CopilotQuotaSnapshot | undefined>, now = new Date()): PlanUsage {
  const premium = snapshots.premium_interactions ?? null;
  const used = premium ? (premium.isUnlimitedEntitlement ? 0 : Math.max(0, Math.min(100, 100 - premium.remainingPercentage))) : null;
  return {
    provider: "copilot",
    provider_label: PROVIDER_LABELS.copilot,
    available: premium !== null,
    plan: null,
    five_hour: { key: "five_hour", label: "5 時間", utilization: null, resets_at: null },
    seven_day: { key: "monthly_premium", label: "月（プレミアム）", utilization: used, resets_at: premium?.resetDate ?? null },
    model_weekly: [],
    fetched_at: now.toISOString(),
  };
}
