// AI ごとの使用状況の受け口（取り決めは @shared/ai/contract.ts。下の帯と設定の「使用状況」が読む）
import { z } from "zod";
import { usageContract } from "@shared/ai/contract";
import { PROVIDER_IDS } from "@shared/settings/types";
import { implement } from "@/foundation/core/http/implement";
import type { UsageMonitor } from "@/features/ai/core/usage/monitor";

const provider = z.enum(PROVIDER_IDS).optional();

export function usageRoutes({ usage }: { usage: UsageMonitor }) {
  return implement(usageContract, {
    context: {},
    "GET /api/usage": { query: z.object({ provider }), run: async ({ query }) => (query.provider ? [await usage.current(query.provider)] : usage.all()) },
    "POST /api/usage/refresh": {
      body: z.object({ provider, force: z.boolean().optional() }),
      run: async ({ body: { provider: id, force = true } }) => (id ? [await usage.refresh(id, force)] : usage.refreshAll(force)),
    },
  });
}
