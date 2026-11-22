import { useEffect } from "react";
import type { ServiceUsage } from "@shared/ai/types";
import { USAGE_REFRESH_MS } from "@shared/ai/usageRefresh";
import { api } from "@/foundation/ui/api";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";

/**
 * サービスごとの使用状況（Codex など。下の帯と詳細で共有する）。Codex のクレジットの様子は、取り直しを待たずに
 * SSE の codex_credits（実行中に残りが減った・枠に空きが戻った）で当てる
 */
export const serviceUsageStore = createStore<ServiceUsage[]>({
  load: () => api.usageServices(),
  maxAge: USAGE_REFRESH_MS,
  reduce: { codex_credits: (current, e) => (current ? current.map((s) => (s.id === "codex" ? { ...s, credits: e.credits } : s)) : current) },
});

/** サービスごとの使用状況を読み、出している間は詳細を閉じていても 1 分ごと（USAGE_REFRESH_MS）に取り直す（詳細も同じ店を読む） */
export function useServiceUsage() {
  const usage = useStore(serviceUsageStore);
  useEffect(() => {
    serviceUsageStore.ensure();
    const timer = setInterval(() => void serviceUsageStore.reload().catch(() => {}), USAGE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return usage;
}

/** 「更新」: コアに取り直させ、下の帯にも当てる */
export async function refreshServiceUsage(): Promise<void> {
  serviceUsageStore.set(await api.refreshUsageServices());
}
