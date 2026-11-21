// AI のつなぎ込みの機能のコアの入口（ほかの機能はここだけを読む）
export { askSummary, askTitle, canAsk } from "./ask";
export type { AgentProvider, ApprovalRequest, GateAsk, GateCall, GateOutcome, GuardMaterials, ProviderCallbacks, ToolGate, ToolGateFactory } from "./providers/types";
export { askApproval, declinedNote, isAllowed, modeVerdict, permissionOnlyGate, wordsOf } from "./permissionMode";
export type { UsageMonitor } from "./usage/monitor";
import type { ProviderId } from "@shared/settings/types";
import type { CoreFeature } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import type { SecretCipher } from "@/foundation/core/system/sealedSecret";
import type { ProjectsApi } from "@/features/projects/core/index";
import type { AgentProvider } from "./providers/types";
import { ProviderKeyVault, type ProviderAuth } from "./providers/keys";
import { UsageMonitor, type UsageFetchers } from "./usage/monitor";
import { realUsageFetchers } from "./providers/usageFetchers";
import { providerRoutes } from "./routes/providers";
import { usageRoutes } from "./routes/usage";

export interface AiEnv {
  /** AI のつなぎ込み（本物は自分の情報と API キーを渡した各 AI。テストは偽のプロバイダー） */
  providers(authFor: (id: ProviderId) => Promise<ProviderAuth>): Record<ProviderId, AgentProvider>;
  /** 使用状況の取り方（省けば本物。テストはネットワークに出ない偽物） */
  usage?: UsageFetchers;
  /** AI の API キーの暗号化（null なら暗号化せずに置く） */
  secretCipher: SecretCipher | null;
}

export interface AiApi {
  providers: Record<ProviderId, AgentProvider>;
  /** AI の API キー（暗号化して置く。置いたかだけを返す） */
  keys: ProviderKeyVault;
  /** 使用状況の見張り（AI ごとの使用状況・実行中の支払いの知らせ・使い切った枠の戻る時刻） */
  usage: UsageMonitor;
  /** Copilot の使用状況が読む gh のログインのトークンの口（github が登録する。なければ未ログインの扱い） */
  provideGhToken(fn: () => Promise<string | null>): void;
}

/** AI のつなぎ込み（プロバイダー・API キー・使用状況。使用枠の見張りは待ち受けのあとに始める） */
export function createAi(k: Kernel, deps: { projects: ProjectsApi }, env: AiEnv): CoreFeature<AiApi> {
  const keys = new ProviderKeyVault(k, env.secretCipher);
  const providers = env.providers((id) => keys.authFor(id));
  let ghToken: () => Promise<string | null> = async () => null;
  const usage = new UsageMonitor(k.bus, env.usage ?? realUsageFetchers(() => ghToken()));
  return {
    name: "ai",
    api: { providers, keys, usage, provideGhToken: (fn) => (ghToken = fn) },
    routes: [{ legacy: (app) => (providerRoutes(app, { store: { settings: k.settings, projects: deps.projects.store }, providers, providerKeys: keys, bus: k.bus }), usageRoutes(app, { usage })) }],
    start: () => usage.start(),
    stop: () => usage.stop(),
  };
}
