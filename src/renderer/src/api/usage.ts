import type { PlanUsage, ServiceUsage } from "@shared/types";
import { request } from "./http";

/** プランの使用枠（5 時間・週）と、設定の「使用状況」のサービスごとの使用状況（コアの routes/usage.ts） */
export const usageApi = {
  usage: () => request<PlanUsage>("GET", "/api/usage"),
  refreshUsage: () => request<PlanUsage>("POST", "/api/usage/refresh"),
  usageServices: () => request<ServiceUsage[]>("GET", "/api/usage/services"),
  refreshUsageServices: () => request<ServiceUsage[]>("POST", "/api/usage/services/refresh"),
};
