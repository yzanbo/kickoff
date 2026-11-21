import type { Hono } from "hono";
import type { UsageMonitor } from "@/features/ai/core/usage/monitor";

/** プランの使用枠（5 時間・週）と、設定の「使用状況」のサービスごとの使用状況（前の形。画面が ProviderUsage に乗せ替えたら 2 本にする） */
export function usageRoutes(app: Hono, { usage }: { usage: UsageMonitor }) {
  app.get("/api/usage", async (c) => c.json(await usage.planUsage()));
  app.post("/api/usage/refresh", async (c) => c.json(await usage.planUsage(true)));
  app.get("/api/usage/services", async (c) => c.json(await usage.serviceUsages()));
  app.post("/api/usage/services/refresh", async (c) => c.json(await usage.serviceUsages(true)));
}
