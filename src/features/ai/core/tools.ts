// AI のつなぎ込みが出す AI のツール（kickoff_chat の get_usage。定義と中身）: Claude のプランの使用枠の残りを返す。読むだけなので聞かずに返す
import { defineAiTool, type AiToolGroup } from "@/foundation/core/aiTools/tool";
import { extraUsageSpendText, OVERAGE_STATE_HINTS, OVERAGE_STATE_LABELS, overageStateOf } from "@shared/ai/overage";
import type { PlanUsage, UsageWindow } from "@shared/ai/types";

/** 使用枠の 1 つの文（「5 時間: 42% 使用（残り 58%）・2026-11-13T15:00:00Z にリセット」） */
function windowText(w: UsageWindow): string {
  if (w.utilization === null) return `${w.label}: まだ始まっていません`;
  const used = Math.round(w.utilization);
  const reset = w.resets_at ? `・${w.resets_at} にリセット` : "";
  return `${w.label}: ${used}% 使用（残り ${Math.max(0, 100 - used)}%）${reset}${w.detail ? `（${w.detail}）` : ""}`;
}

/** 使用枠を AI に返す文にする */
export function usageText(u: PlanUsage): string {
  if (!u.available) return `${u.provider_label} のプランの使用枠は取得できません${u.error ? `（${u.error}）` : "（API キーで使っているなど）"}。`;
  const lines = [
    `${u.provider_label} のプランの使用枠（${u.fetched_at} に取得${u.plan ? `・プラン ${u.plan}` : ""}）:`,
    `- ${windowText(u.five_hour)}`,
    `- ${windowText(u.seven_day)}`,
    ...u.model_weekly.map((w) => `- ${windowText(w)}`),
  ];
  // 超過分の様子（意図せず課金していないか）と、この請求期間の超過分の額
  const overage = overageStateOf(u);
  lines.push(`- ${OVERAGE_STATE_LABELS[overage]}（${OVERAGE_STATE_HINTS[overage]}）`);
  const spend = u.extra_usage ? extraUsageSpendText(u.extra_usage) : null;
  if (spend) lines.push(`- ${spend}`);
  if (u.error) lines.push(`（最新の取得に失敗したため、前に取った値です: ${u.error}）`);
  return lines.join("\n");
}

/**
 * 使用枠の残りを返すツールの組（kickoff_chat の order 50。chat の読むツールの組のあとに並ぶ）。
 * チャットの AI によらず Claude のプランの使用枠を返す（チャットの AI の枠にするかは利用者に聞くこと）
 */
export function usageToolGroup(usage: { planUsage(): Promise<PlanUsage> }): AiToolGroup {
  return {
    server: "kickoff_chat",
    order: 50,
    instructions: ["get_usage は、Claude のプランの使用枠（5 時間・週）の使った割合とリセットの時刻を返す。重い作業を続けるか決めるときの手がかりに使う。"],
    open: () => [
      defineAiTool({ server: "kickoff_chat", name: "get_usage", description: "Claude のプランの使用枠（5 時間・週）の使った割合とリセットの時刻", input: {}, run: async () => usageText(await usage.planUsage()) }),
    ],
  };
}
