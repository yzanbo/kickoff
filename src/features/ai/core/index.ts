// AI のつなぎ込みの機能のコアの入口（ほかの機能はここだけを読む）
import type { ProviderId } from "@shared/settings/types";
import type { Bus } from "@/foundation/core/bus";
import type { CoreFeature } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { SecretCipher } from "@/foundation/core/system/sealedSecret";
import type { AgentProvider } from "./providers/types";
import { ProviderKeyVault, type ProviderAuth } from "./providers/keys";
import { CodexCreditsWatch } from "./usage/codexCredits";
import type { UsageMonitor } from "./usage/planUsage";
import type { UsageFetcher } from "./usage/services/common";
import { ServiceUsageMonitor } from "./usage/services/index";
import { providerRoutes } from "./routes/providers";
import { usageRoutes } from "./routes/usage";

export interface AiEnv {
  /** AI のつなぎ込み（本物は自分の情報と API キーを渡した各 AI。テストは偽のプロバイダー） */
  providers(authFor: (id: ProviderId) => Promise<ProviderAuth>): Record<ProviderId, AgentProvider>;
  /** Claude のプランの使用枠 */
  usage(claude: AgentProvider, bus: Bus): UsageMonitor;
  /** 設定の「使用状況」のほかのサービス（省けば本物の一覧） */
  services?: UsageFetcher[];
  /** AI の API キーの暗号化（null なら暗号化せずに置く） */
  secretCipher: SecretCipher | null;
}

export interface AiApi {
  providers: Record<ProviderId, AgentProvider>;
  /** AI の API キー（暗号化して置く。置いたかだけを返す） */
  keys: ProviderKeyVault;
  usage: UsageMonitor;
  /** 設定の「使用状況」のサービスごとの使用状況 */
  serviceUsage: ServiceUsageMonitor;
  /** Codex のクレジットの見張り（使用状況の取得と、Codex の実行中の知らせの両方から残りを受ける） */
  codexCredits: CodexCreditsWatch;
}

/** AI のつなぎ込み（プロバイダー・API キー・使用状況。使用枠の見張りは待ち受けのあとに始める） */
export function createAi(k: KernelWithStore, env: AiEnv): CoreFeature<AiApi> {
  const keys = new ProviderKeyVault(k, env.secretCipher);
  const providers = env.providers((id) => keys.authFor(id));
  // 使用枠（下の帯・超過分の知らせ）は Claude のプランから取得する（ほかの AI は serviceUsage）
  const usage = env.usage(providers.claude, k.bus);
  const codexCredits = new CodexCreditsWatch(k.bus);
  const serviceUsage = new ServiceUsageMonitor(usage, env.services, codexCredits);
  return {
    name: "ai",
    api: { providers, keys, usage, serviceUsage, codexCredits },
    routes: [{ legacy: (app) => (providerRoutes(app, { store: { settings: k.settings, projects: k.store.projects, chats: k.store.chats, groups: k.store.groups }, providers, providerKeys: keys, bus: k.bus }), usageRoutes(app, { usage, serviceUsage })) }],
    start: () => usage.start(),
    stop: () => usage.stop(),
  };
}
