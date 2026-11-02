import type { SelfInfo } from "../selfProtection.js";
import type { ProviderId } from "../types.js";
import { ClaudeProvider } from "./claude.js";
import { PlannedProvider } from "./planned.js";
import type { AgentProvider } from "./types.js";

export type { AgentProvider } from "./types.js";

/** 利用可能なプロバイダー。新しいプロバイダーはここに追加する */
export function createProviders(self?: SelfInfo): Record<ProviderId, AgentProvider> {
  return {
    claude: new ClaudeProvider(self),
    codex: new PlannedProvider("codex", "Codex", "codex"),
    gemini: new PlannedProvider("gemini", "Gemini", "gemini"),
  };
}
