import { useCallback, useState } from "react";
import type { PlanUsage, UsageWindow } from "@shared/types";
import { api } from "@/api";
import { useTicker } from "@/hooks/useTicker";
import { usageStore } from "@/stores/usage";
import { useStore } from "@/stores/useStore";

/** プランの使用枠（使用枠の店 stores/usage.ts。初回は API から取得し、以降はサーバーからのイベントで更新する）と、手で取り直す操作 */
export function usePlanUsage() {
  const usage = useStore(usageStore).data;
  const [refreshing, setRefreshing] = useState(false);
  // リセットまでの残り時間の表示を進めるための再描画
  useTicker(60_000);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      usageStore.set(await api.refreshUsage());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { usage, refresh, refreshing };
}

/** 契約プランの表示名（"max" → "Max"） */
export function planLabel(plan: string): string {
  const known: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise", free: "Free" };
  return known[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

/** 使用枠を取得できなかったときの文 */
export function usageUnavailableText(usage: PlanUsage): string {
  return `プランの使用枠を取得できませんでした${usage.error ? `（${usage.error}）` : ""}。`;
}

/** 使用率の段階（70% から注意、90% から警告） */
export function usageLevel(pct: number): "normal" | "warning" | "critical" {
  return pct >= 90 ? "critical" : pct >= 70 ? "warning" : "normal";
}

/** モデル別の週枠（「週（Fable）」）なら、そのモデル名 */
export function weeklyModel(label: string): string | undefined {
  return /^週（(.+)）$/.exec(label)?.[1];
}

/**
 * 使用枠の名前（下の帯・使用状況・チャット欄のコンテキストの詳細・設定で同じ付け方）: モデル別の週枠（「週（Fable）」）は「週 · Fable」、
 * ほかはそのまま（「5時間」「週」）。short（下の帯の 1 行表示）では、モデル別の週枠をモデル名だけ（「Fable」）にする
 */
export function usageWindowLabel(w: Pick<UsageWindow, "label">, short = false): string {
  const model = weeklyModel(w.label);
  if (!model) return w.label;
  return short ? model : `週 · ${model}`;
}

/** CLI のログイン情報の 1 行（"you@example.com ・ Max プラン"）。どちらも分からなければ空 */
export function accountLine(status: { account?: string; plan?: string }): string {
  return [status.account, status.plan && `${planLabel(status.plan)} プラン`].filter(Boolean).join(" ・ ");
}

/** ログインしているアカウントの契約プラン（"Claude Max" など。分からなければ null） */
export function planName(usage: PlanUsage | undefined): string | null {
  return usage?.plan ? `${usage.provider_label} ${planLabel(usage.plan)}` : null;
}

export const FIVE_HOUR_IDLE = "Claude から 5 時間枠の情報が返っていません（枠が始まっていないか、今のプランに適用されていません）";
