import type { ProviderUsage } from "@shared/ai/usage";
import { USAGE_REFRESH_MS } from "@shared/ai/usageRefresh";
import { usageApi } from "@/features/ai/ui/api/usage";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";

/** 一覧のその AI の分を置き換える（一覧にない AI は足さない） */
const replace = (list: ProviderUsage[], usage: ProviderUsage) => (list.some((u) => u.provider === usage.provider) ? list.map((u) => (u.provider === usage.provider ? usage : u)) : list);

/**
 * AI ごとの使用状況（Codex など。下の帯と詳細・設定の「使用状況」で共有する）。取り直しを待たずに、
 * SSE の usage（AI ごとの取得結果やクレジットの変化）でその AI の分を当てる
 */
export const serviceUsageStore = createStore<ProviderUsage[]>({
  load: () => usageApi("GET /api/usage"),
  maxAge: USAGE_REFRESH_MS,
  refreshAfterMaxAge: true,
  reduce: { usage: (current, e) => replace(current, e.usage) },
});

/** 使用状況を読み、出している間は詳細を閉じていても 1 分ごと（USAGE_REFRESH_MS）に取り直す（詳細も同じ店を読む） */
export function useServiceUsage() {
  return useStore(serviceUsageStore);
}

/** 「更新」: コアにすべての AI を取り直させ、下の帯にも当てる */
export async function refreshServiceUsage(): Promise<void> {
  serviceUsageStore.set(await usageApi("POST /api/usage/refresh", { body: { force: true } }));
}
