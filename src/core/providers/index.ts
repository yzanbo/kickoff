import type { SelfInfo } from "../chat/guard/selfProtection.js";
import { PROVIDER_LABELS, type ProviderId } from "@shared/types";
import { ClaudeProvider } from "./claude/provider.js";
import { PlannedProvider } from "./planned.js";
import type { AgentProvider } from "./types.js";

export type { AgentProvider } from "./types.js";

/** 利用可能なプロバイダー。新しいプロバイダーはここに追加する */
export function createProviders(self?: SelfInfo): Record<ProviderId, AgentProvider> {
  return {
    claude: new ClaudeProvider(self),
    codex: new PlannedProvider("codex", PROVIDER_LABELS.codex, "codex"),
    copilot: new PlannedProvider("copilot", PROVIDER_LABELS.copilot, "copilot"),
    cursor: new PlannedProvider("cursor", PROVIDER_LABELS.cursor, "agent"),
    // Gemini は Antigravity CLI を API キーで動かす（メモの仕様書「0021」の Q11・Q13。定額の枠では使えない）
    gemini: new PlannedProvider("gemini", PROVIDER_LABELS.gemini, "agy"),
  };
}
