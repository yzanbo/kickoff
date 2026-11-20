// プランの使用枠（5 時間・週。アプリ全体で 1 つ）。初めて使うときに読み、以降はサーバーの知らせ（usage）で置き換える
import type { PlanUsage } from "@shared/ai/types";
import { api } from "@/foundation/ui/api";
import { createStore } from "@/foundation/ui/store/createStore";

/** 手で取り直したら、応答を set で入れる */
export const usageStore = createStore<PlanUsage>({
  load: () => api.usage(),
  reduce: { usage: (_current, e) => e.usage },
});
