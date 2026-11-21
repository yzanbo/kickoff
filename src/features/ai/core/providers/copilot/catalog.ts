import type { ModelOption } from "@shared/chat/types";
import { EFFORT_LEVELS, type EffortLevel } from "@shared/settings/types";
import type { AskModel } from "@/features/ai/core/providers/types";
import type { ModelInfo } from "./sdk";

/** Copilot の答え（モデルの一覧）を Kickoff の形にする（純粋関数） */

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
