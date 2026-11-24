import type { AppSettings } from "@shared/foundation/contract/settings";
import { request } from "@/foundation/ui/api/http";

/** アプリ全体の設定（送った項目だけを変える。コアの routes/settings.ts） */
export const settingsApi = {
  settings: () => request<AppSettings>("GET", "/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>("PUT", "/api/settings", patch),
};
