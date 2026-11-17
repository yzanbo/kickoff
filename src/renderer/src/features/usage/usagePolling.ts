import { USAGE_REFRESH_MS } from "@shared/usageRefresh";

/** 使用状況が表示されている間だけ、1 分ごとに更新する。 */
export function startUsagePolling(refresh: () => void): () => void {
  const timer = setInterval(refresh, USAGE_REFRESH_MS);
  return () => clearInterval(timer);
}
