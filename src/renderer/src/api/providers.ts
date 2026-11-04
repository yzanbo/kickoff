import type { EffortDefault, GitHubStatus, ModelOption, ProviderId, ProviderStatus, SlashCommandOption } from "@shared/types";
import { request } from "./http";
import { workdirPath, type GitTarget } from "./workdir";

/** 外部 CLI（Claude などのプロバイダー・gh）の状態と、チャット欄のモデル・/ のコマンド・既定の推論の深さ（コアの routes/providers.ts） */
export const providersApi = {
  providers: () => request<ProviderStatus[]>("GET", "/api/providers"),
  github: () => request<GitHubStatus>("GET", "/api/github"),
  models: (provider: ProviderId) => request<ModelOption[]>("GET", `/api/providers/${provider}/models`),
  /** 推論の深さを指定しないとき（既定）に Claude Code が使う深さ（設定から求める） */
  effortDefault: (projectId: number, model: string | null, worktree?: string) =>
    request<EffortDefault>("GET", workdirPath({ projectId, worktree }, "/effort-default", { model })),
  /** チャット欄の / で出すコマンド（作業場所のプロジェクトのコマンド・スキルも含む） */
  slashCommands: (target: GitTarget) => request<SlashCommandOption[]>("GET", workdirPath(target, "/commands")),
};
