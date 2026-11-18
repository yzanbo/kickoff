import { useEffect } from "react";
import type { ServiceUsage } from "@shared/types";
import { USAGE_REFRESH_MS } from "@shared/usageRefresh";
import { api } from "@/api";
import { createStore } from "@/stores/createStore";
import { useStore } from "@/stores/useStore";
import { startUsagePolling } from "./usagePolling";

/** サービスごとの使用状況（Codex など。下の帯と詳細で共有する） */
export const serviceUsageStore = createStore<ServiceUsage[]>({ load: () => api.usageServices(), maxAge: USAGE_REFRESH_MS });

/** サービスごとの使用状況を読み、出している間は詳細を閉じていても 1 分ごとに取り直す（詳細も同じ店を読む） */
export function useServiceUsage() {
  const usage = useStore(serviceUsageStore);
  useEffect(() => {
    serviceUsageStore.ensure();
    return startUsagePolling(() => void serviceUsageStore.reload().catch(() => {}));
  }, []);
  return usage;
}

/** 「更新」: コアに取り直させ、下の帯にも当てる */
export async function refreshServiceUsage(): Promise<void> {
  serviceUsageStore.set(await api.refreshUsageServices());
}
