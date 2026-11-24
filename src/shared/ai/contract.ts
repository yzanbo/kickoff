// AI の取り決め（プロジェクトごとの AI のチャットの既定・AI ごとの使用状況。受け口は src/features/ai/core/routes/aiDefaults.ts・usage.ts）
import { route, type Contract } from "@shared/foundation/contract";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import type { ProjectAiDefaults } from "./chatOptions";
import type { ProviderUsage } from "./usage";

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

/** 使用状況を取り直す本文（provider を省けばすべての AI。force を省けば間を空けずに取り直す = 「更新」） */
export interface UsageRefreshBody {
  provider?: ProviderId;
  force?: boolean;
}

export const usageContract = {
  /** AI ごとの使用状況（provider を渡せばその AI の分だけ。ほかの AI の取得を待たない。1 分以内はとっておいた値） */
  "GET /api/usage": route<never, ProviderUsage[], { provider?: ProviderId }>(),
  /** 取り直した使用状況（provider を渡せばその AI の分だけ） */
  "POST /api/usage/refresh": route<UsageRefreshBody, ProviderUsage[]>(),
} as const satisfies Contract;
