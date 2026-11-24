import type { ProviderStatus, SlashCommandOption, EffortDefault, ModelOption, ProviderLoginStart } from "@shared/ai/types";
import type { GitHubStatus } from "@shared/foundation/server";
import type { ProviderId } from "@shared/settings/types";
import { request } from "@/foundation/ui/api/http";
import { workdirPath, type GitTarget } from "@/foundation/ui/api/workdir";

/** 外部 CLI（Claude などのプロバイダー・gh）の状態と、チャット欄のモデル・/ のコマンド・既定の推論の深さ（コアの routes/providers.ts） */
export const providersApi = {
  providers: () => request<ProviderStatus[]>("GET", "/api/providers"),
  github: () => request<GitHubStatus>("GET", "/api/github"),
  models: (provider: ProviderId) => request<ModelOption[]>("GET", `/api/providers/${provider}/models`),
  /** AI の API キーを置く・消す（null で消す。キーは画面に返らない） */
  saveProviderApiKey: (provider: ProviderId, key: string | null) => request<void>("PUT", `/api/providers/${provider}/api-key`, { key }),
  /** AI のブラウザでのログインを始める（開く URL が返る。終わりは SSE の provider_login） */
  startProviderLogin: (provider: ProviderId) => request<ProviderLoginStart>("POST", `/api/providers/${provider}/login`),
  /** ブラウザでのログインをやめる */
  cancelProviderLogin: (provider: ProviderId) => request<void>("DELETE", `/api/providers/${provider}/login`),
  /** 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める） */
  effortDefault: (projectId: number, model: string | null, worktree?: string) =>
    request<EffortDefault>("GET", workdirPath({ projectId, worktree }, "/effort-default", { model })),
  /** チャット欄の / で出すコマンド（そのチャットの AI の。作業場所のプロジェクトのコマンド・スキルも含む） */
  slashCommands: (target: GitTarget, provider: ProviderId) => request<SlashCommandOption[]>("GET", workdirPath(target, "/commands", { provider })),
};
