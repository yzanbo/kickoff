import assert from "node:assert/strict";
import { test } from "vitest";
import type { ModelOption } from "@shared/types";
import { knownModel, providerModels } from "./modelCatalog";
import type { AgentProvider } from "./types";

const option = (value: string): ModelOption => ({ value, label: value, description: "", efforts: [], supports_auto_mode: true, supports_fast_mode: false });

/** モデルの一覧だけを持つ AI（呼んだ回数を数える） */
function catalogProvider(models: ModelOption[]) {
  const provider = { calls: 0, models: async () => (provider.calls++, models) };
  return provider as unknown as AgentProvider & { calls: number };
}

test("一覧にないモデルは外し（その AI の既定で動かす）、一覧にあるもの・null はそのまま（メモの仕様書「0028」の 9 節）", async () => {
  const codex = catalogProvider([option("gpt-6.1-sol"), option("gpt-6-luna")]);
  assert.equal(await knownModel("codex", codex, "opus"), null);
  assert.equal(await knownModel("codex", codex, "gpt-6-luna"), "gpt-6-luna");
  assert.equal(await knownModel("codex", codex, null), null);
  // 一覧は覚えて使い回す
  assert.equal(codex.calls, 1);
});

test("Claude Code（一覧の外の名前も受け付ける）と、一覧が取れない AI は触らない", async () => {
  const claude = catalogProvider([option("opus")]);
  assert.equal(await knownModel("claude", claude, "claude-opus-4-1"), "claude-opus-4-1");
  assert.equal(claude.calls, 0);
  const empty = catalogProvider([]);
  assert.equal(await knownModel("codex", empty, "opus"), "opus");
  // 空の結果は覚えない（次はまた聞く）
  await providerModels(empty);
  assert.equal(empty.calls, 2);
  const none = {} as AgentProvider;
  assert.equal(await knownModel("codex", none, "opus"), "opus");
});
