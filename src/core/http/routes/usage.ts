import type { Hono } from "hono";
import type { ServerDeps } from "../server.js";

/** プランの使用枠（5 時間・週）と、設定の「使用状況」のサービスごと（Claude Code・Codex・GitHub Copilot・Cursor・Gemini）の使用状況 */
export function usageRoutes(app: Hono, { usage, serviceUsage }: ServerDeps) {
  app.get("/api/usage", async (c) => c.json(await usage.get()));
  app.post("/api/usage/refresh", async (c) => c.json(await usage.refresh(true)));
  app.get("/api/usage/services", async (c) => c.json(await serviceUsage.get()));
  app.post("/api/usage/services/refresh", async (c) => c.json(await serviceUsage.refresh(true)));
}
