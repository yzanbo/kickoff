// プランの使用枠（Claude の 5 時間・週。アプリ全体で 1 つ）。初めて使うときに読み、以降はサーバーの知らせ（usage）で置き換える
import { PLAN_USAGE_PROVIDER, type ProviderUsage } from "@shared/ai/usage";
import { usageApi } from "@/features/ai/ui/api/usage";
import { createStore } from "@/foundation/ui/store/createStore";

const provider = PLAN_USAGE_PROVIDER;

/** その AI の分だけを読む（ほかの AI の取得を待たない）。手で取り直したら、応答を set で入れる */
export const usageStore = createStore<ProviderUsage>({
  load: async () => (await usageApi("GET /api/usage", { query: { provider } }))[0]!,
  reduce: { usage: (current, e) => (e.usage.provider === provider ? e.usage : current) },
});

/** 「更新」: コアに取り直させ、応答を店に入れる */
export async function refreshPlanUsage(): Promise<void> {
  const [usage] = await usageApi("POST /api/usage/refresh", { body: { provider, force: true } });
  if (usage) usageStore.set(usage);
}
