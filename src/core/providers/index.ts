import type { SelfInfo } from "../chat/guard/selfProtection.js";
import { CodexProvider } from "./codex/provider.js";
import { CopilotProvider } from "./copilot/provider.js";
import { PROVIDER_LABELS, type ProviderId } from "@shared/types";
import { ClaudeProvider } from "./claude/provider.js";
import { PlannedProvider } from "./planned.js";
import type { AgentProvider } from "./types.js";

export type { AgentProvider } from "./types.js";

/**
 * 本物の CLI・アカウントで確かめる前の新しい AI を、開発のときだけ使う環境変数（, 区切りの ID。例: KICKOFF_EXPERIMENTAL_PROVIDERS=codex,copilot）。
 * 確かめるまでは対応予定（PlannedProvider）のままにし、画面で選べない（メモの仕様書「0021」の範囲）
 */
export function experimentalProviders(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.KICKOFF_EXPERIMENTAL_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** 利用可能なプロバイダー。新しいプロバイダーはここに追加する */
export function createProviders(self?: SelfInfo): Record<ProviderId, AgentProvider> {
  const experimental = experimentalProviders();
  return {
    claude: new ClaudeProvider(self),
    codex: experimental.has("codex") ? new CodexProvider({ self }) : new PlannedProvider("codex", PROVIDER_LABELS.codex, "codex"),
    copilot: experimental.has("copilot") ? new CopilotProvider({ self }) : new PlannedProvider("copilot", PROVIDER_LABELS.copilot, "copilot"),
    cursor: new PlannedProvider("cursor", PROVIDER_LABELS.cursor, "agent"),
    // Gemini は Antigravity CLI を API キーで動かす（メモの仕様書「0021」の Q11・Q13。定額の枠では使えない）
    gemini: new PlannedProvider("gemini", PROVIDER_LABELS.gemini, "agy"),
  };
}
