// プロバイダーができること（任意の機能を持つかから決める。画面は持たないものを押せない形にする）
import type { ProviderFeature } from "@shared/ai/types";
import type { AgentProvider } from "./types";

/** 任意の機能を持つかから、できることを並べる（PROVIDER_FEATURES の順） */
export function providerFeatures(provider: AgentProvider): ProviderFeature[] {
  const has: Record<ProviderFeature, boolean> = {
    fork: typeof provider.fork === "function",
    rewind_files: typeof provider.rewindFiles === "function",
    subagent_log: typeof provider.subagentLog === "function",
    usage: typeof provider.usage === "function",
    commands: typeof provider.commands === "function",
    models: typeof provider.models === "function",
    summarize: typeof provider.summarize === "function",
    login: typeof provider.login === "function",
  };
  return (Object.keys(has) as ProviderFeature[]).filter((f) => has[f]);
}
