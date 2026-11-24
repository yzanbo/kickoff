// プロバイダーにできること（AI ごとの表 @shared/ai/providers と、本物の実装か）
import { PROVIDER_CAPABILITIES, providerCan, type ProviderCapability } from "@shared/ai/providers";
import type { AgentProvider } from "@/features/ai/core/providers/types";

/** できるか（本物の実装で、表にあるとき。対応予定の AI は何もできない） */
export const hasCapability = (provider: AgentProvider, capability: ProviderCapability): boolean => provider.implemented && providerCan(provider.id, capability);

/** できることの一覧（/api/providers の capabilities。表の順） */
export const capabilitiesOf = (provider: AgentProvider): ProviderCapability[] => PROVIDER_CAPABILITIES.filter((c) => hasCapability(provider, c));
