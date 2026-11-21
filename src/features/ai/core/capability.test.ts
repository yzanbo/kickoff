import { test } from "vitest";
import assert from "node:assert/strict";
import { PROVIDER_IDS } from "@shared/settings/types";
import { PROVIDERS, providerCan, type ProviderCapability } from "@shared/ai/providers";
import { fakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import { fakeCopilotClient } from "@/features/ai/core/testing/fakeCopilotClient";
import { fakeAcpAgent, fakeCodexServer } from "@/features/ai/core/testing/fakeStdioServer";
import { ClaudeProvider } from "@/features/ai/core/providers/claude/provider";
import { CodexProvider } from "@/features/ai/core/providers/codex/provider";
import { CopilotProvider } from "@/features/ai/core/providers/copilot/provider";
import { cursorProvider } from "@/features/ai/core/providers/cursor/provider";
import { geminiProvider } from "@/features/ai/core/providers/gemini/provider";
import { PlannedProvider } from "@/features/ai/core/providers/planned";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { capabilitiesOf, hasCapability } from "./capability";

/** メソッドがあることで決まる「できる」と、その口の名前 */
const METHOD_OF: Partial<Record<ProviderCapability, keyof AgentProvider>> = {
  fork: "fork",
  rewind_files: "rewindFiles",
  subagent_log: "subagentLog",
  commands: "commands",
  models: "models",
  ask: "ask",
  login: "login",
  sessions: "sessions",
  effort_default: "effortDefault",
};

const realProviders = (): AgentProvider[] => [
  new ClaudeProvider({ sdk: fakeClaudeSdk().sdk, executable: "claude" }),
  new CodexProvider({ spawn: fakeCodexServer().spawn }),
  new CopilotProvider({ clientFactory: fakeCopilotClient().factory }),
  cursorProvider({ spawn: fakeAcpAgent().spawn }),
  geminiProvider({ spawn: fakeAcpAgent().spawn }),
];

test("本物の実装のメソッドと、表のメソッドの「できる」は食い違わない", () => {
  const providers = realProviders();
  assert.deepEqual(providers.map((p) => p.id), [...PROVIDER_IDS]);
  for (const provider of providers) {
    for (const [capability, method] of Object.entries(METHOD_OF) as [ProviderCapability, keyof AgentProvider][]) {
      assert.equal(provider[method] !== undefined, providerCan(provider.id, capability), `${provider.id} の ${capability}`);
    }
  }
});

test("できることは本物の実装なら表のとおり、対応予定の AI は空", () => {
  for (const provider of realProviders()) assert.deepEqual(capabilitiesOf(provider), [...PROVIDERS[provider.id].capabilities].sort((a, b) => order(a) - order(b)));
  const planned = new PlannedProvider("copilot", "GitHub Copilot", "copilot");
  assert.deepEqual(capabilitiesOf(planned), []);
  assert.equal(hasCapability(planned, "ask"), false);
});

const order = (c: ProviderCapability) => (["fork", "rewind_files", "subagent_log", "commands", "models", "ask", "login", "sessions", "effort_default", "sandbox_off", "sandbox_diagnostics", "switch", "any_model", "fast_mode", "model_effort_default", "plan_usage", "pay_as_you_go"] as const).indexOf(c);
