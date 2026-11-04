import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BusEvent, PlanUsage } from "@shared/types";
import { api } from "@/api";
import { useTicker } from "@/hooks/useTicker";

/** プランの使用枠。初回は API から取得し、以降はサーバーからのイベントで更新する */
export function usePlanUsage() {
  const [usage, setUsage] = useState<PlanUsage>();
  const [refreshing, setRefreshing] = useState(false);
  // リセットまでの残り時間の表示を進めるための再描画
  useTicker(60_000);

  useEffect(() => {
    api.usage().then(setUsage).catch(() => {});
  }, []);

  const onEvent = useCallback((e: BusEvent) => {
    if (e.type === "usage") setUsage(e.usage);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setUsage(await api.refreshUsage());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { usage, onEvent, refresh, refreshing };
}

/** アプリ全体で 1 つの使用枠を共有する（チャット欄のコンテキストの表示などから使う） */
export const PlanUsageContext = createContext<ReturnType<typeof usePlanUsage> | null>(null);
export const useSharedPlanUsage = () => useContext(PlanUsageContext);

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

/** CLI のログイン情報の 1 行（"you@example.com ・ Max プラン"）。どちらも分からなければ空 */
export function accountLine(status: { account?: string; plan?: string }): string {
  return [status.account, status.plan && `${planLabel(status.plan)} プラン`].filter(Boolean).join(" ・ ");
}

/** ログインしているアカウントの契約プラン（"Claude Max" など。分からなければ null） */
export function planName(usage: PlanUsage | undefined): string | null {
  return usage?.plan ? `${usage.provider_label} ${planLabel(usage.plan)}` : null;
}

export const FIVE_HOUR_IDLE = "Claude から 5 時間枠の情報が返っていません（枠が始まっていないか、今のプランに適用されていません）";
