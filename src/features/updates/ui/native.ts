// updates が window.kickoff を読む所（Mac のアプリの中だけ: 版の情報）
import type { BuildInfo } from "@shared/updates/types";

/** 更新の口（Mac のアプリの外なら null） */
export const updatesNative = {
  build: async (): Promise<BuildInfo | null> => (await window.kickoff?.updates.build()) ?? null,
};
