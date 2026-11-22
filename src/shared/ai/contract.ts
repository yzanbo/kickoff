// AI の既定の取り決め（プロジェクトごとの AI のチャットの既定。受け口は src/features/ai/core/routes/aiDefaults.ts）
import { route, type Contract } from "@shared/foundation/contract";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import type { ProjectAiDefaults } from "./chatOptions";

/** プロジェクトのその AI の既定を書く本文（options は書いた項目だけ。空ならその AI の既定を消す = すべてアプリの設定に従う） */
export interface ProjectAiDefaultsBody {
  provider: ProviderId;
  options: ChatOptionsPatch;
}

export const aiDefaultsContract = {
  /** プロジェクトの AI ごとのチャットの既定（書いていない AI・項目はアプリの設定に従う） */
  "GET /api/projects/:projectId/ai-defaults": route<never, ProjectAiDefaults>(),
  /** その AI の既定を置き換える（置き換えたあとの AI ごとの既定） */
  "PUT /api/projects/:projectId/ai-defaults": route<ProjectAiDefaultsBody, ProjectAiDefaults>(),
} as const satisfies Contract;
