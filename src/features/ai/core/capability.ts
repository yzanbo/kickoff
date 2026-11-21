// プロバイダーにできること（AI ごとの表 @shared/ai/providers と、本物の実装か）
import { PROVIDER_CAPABILITIES, providerCan, type ProviderCapability } from "@shared/ai/providers";
import type { ProviderFeature } from "@shared/ai/types";
import type { AgentProvider } from "@/features/ai/core/providers/types";

/** できるか（本物の実装で、表にあるとき。対応予定の AI は何もできない） */
export const hasCapability = (provider: AgentProvider, capability: ProviderCapability): boolean => provider.implemented && providerCan(provider.id, capability);

/** できることの一覧（/api/providers の capabilities。表の順） */
export const capabilitiesOf = (provider: AgentProvider): ProviderCapability[] => PROVIDER_CAPABILITIES.filter((c) => hasCapability(provider, c));

/** 前の形のできること（/api/providers の features。任意のメソッドを持つかから作る。画面が capabilities に乗せ替えたら消す） */
export function providerFeatures(provider: AgentProvider): ProviderFeature[] {
  const has: Record<ProviderFeature, boolean> = {
    fork: typeof provider.fork === "function",
    rewind_files: typeof provider.rewindFiles === "function",
    subagent_log: typeof provider.subagentLog === "function",
    usage: typeof provider.usage === "function",
    commands: typeof provider.commands === "function",
    models: typeof provider.models === "function",
    // 要約は ask で聞く（ask.ts の askSummary）
    summarize: typeof provider.ask === "function",
    login: typeof provider.login === "function",
  };
  return (Object.keys(has) as ProviderFeature[]).filter((f) => has[f]);
}
