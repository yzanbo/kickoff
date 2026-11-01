import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BusEvent, PlanUsage } from "../../core/types";
import { api } from "./api";

/** プランの使用枠。初回は API から取得し、以降はサーバーからのイベントで更新する */
export function usePlanUsage() {
  const [usage, setUsage] = useState<PlanUsage>();
  const [refreshing, setRefreshing] = useState(false);
  // リセットまでの残り時間の表示を進めるための再描画
  const [, setTick] = useState(0);

  useEffect(() => {
    api.usage().then(setUsage).catch(() => {});
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
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

/** リセットまでの残りを短く（"3日後" / "5時間後" / "12分後"） */
export function resetInShort(resetsAt: string | null, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const min = Math.max(0, Math.round((new Date(resetsAt).getTime() - now) / 60_000));
  if (min >= 24 * 60) return `${Math.round(min / (24 * 60))}日後`;
  if (min >= 60) return `${Math.round(min / 60)}時間後`;
  return `${min}分後`;
}

/** リセットまでの残り（"3日後にリセット" / "5時間後にリセット" / "12分後にリセット"） */
export function resetIn(resetsAt: string | null, now = Date.now()): string | null {
  const short = resetInShort(resetsAt, now);
  return short && `${short}にリセット`;
}

export const FIVE_HOUR_IDLE = "Claude から 5 時間枠の情報が返っていません（枠が始まっていないか、今のプランに適用されていません）";
