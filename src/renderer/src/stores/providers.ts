// 外部 CLI（Claude などのプロバイダー・GitHub の gh）の状態と、チャット欄のモデルの一覧。
// ログインはアプリの外で変わるので、プロバイダーと GitHub の状態は使い始めるたびに取り直す（届くまでは前の値を出す）。
// モデルの一覧はアプリ全体で 1 回だけ取る（失敗したら、次に使うときに取り直す）
import type { GitHubStatus, ModelOption, ProviderId, ProviderStatus } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore, useStore } from "./useStore";

export const providersStore = createStore<ProviderStatus[]>({ load: () => api.providers(), maxAge: 0 });
export const githubStore = createStore<GitHubStatus>({ load: () => api.github(), maxAge: 0 });
const modelsStore = createKeyedStore<ProviderId, ModelOption[]>({ load: (provider) => api.models(provider) });

const NO_MODELS: ModelOption[] = Object.freeze([]) as unknown as ModelOption[];

/** プロバイダーの状態（active: false の間は取り直さない。閉じているポップオーバーなど） */
export const useProviders = (options?: { active?: boolean }) => useStore(providersStore, options);
export const useGitHubStatus = () => useStore(githubStore);
/** チャット欄で選べるモデル（読み込み中・読めなかったときは空） */
export const useModels = (provider: ProviderId = "claude"): ModelOption[] => useKeyedStore(modelsStore, provider).data ?? NO_MODELS;
