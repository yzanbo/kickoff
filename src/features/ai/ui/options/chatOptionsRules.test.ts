import assert from "node:assert/strict";
import { test } from "vitest";
import type { ModelOption } from "@shared/ai/types";
import type { ChatOptions } from "@shared/settings/types";
import { fallbackModel, fitChatOptions, initialChatOptions } from "./chatOptionsRules";

const m = (value: string, label: string, more: Partial<ModelOption> = {}): ModelOption => ({ value, label, description: "", efforts: [], supports_auto_mode: true, supports_fast_mode: false, ...more });

test("一覧にないモデル（ほかの AI のモデル・null）は、その AI の既定のモデルにする。一覧が届くまでと Claude Code は直さない（メモの仕様書「0028」の 9 節）", () => {
  const codex = [m("gpt-6.1-sol", "GPT-6.1 Sol"), m("gpt-6-luna", "GPT-6 Luna", { is_default: true })];
  assert.equal(fallbackModel(codex, "opus", "codex"), "gpt-6-luna");
  assert.equal(fallbackModel(codex, null, "codex"), "gpt-6-luna");
  assert.equal(fallbackModel(codex, "gpt-6.1-sol", "codex"), "gpt-6.1-sol");
  // 既定の印がなければ null（その AI の既定）
  assert.equal(fallbackModel([m("gpt-6.1-sol", "GPT-6.1 Sol")], "opus", "codex"), null);
  assert.equal(fallbackModel([], "opus", "codex"), "opus");
  assert.equal(fallbackModel([m("opus", "Opus 5.5")], "claude-opus-4-1", "claude"), "claude-opus-4-1");
});

test("initialChatOptions: 初めては既定が届く前に選んだモデルを残し、プロジェクトを替えたらすべて、AI だけを替えたらモデルと深さだけ当て直し、同じ先なら当てない", () => {
  const defaults: ChatOptions = { model: "opus", effort: "high", permission_mode: "acceptEdits", fast_mode: true };
  const picked: ChatOptions = { model: "fable", effort: null, permission_mode: "default", fast_mode: false };
  const alpha = { target: 1, provider: "claude" } as const;
  assert.deepEqual(initialChatOptions(picked, defaults, null, alpha), { ...defaults, model: "fable" });
  assert.deepEqual(initialChatOptions({ ...picked, model: null }, defaults, null, alpha), defaults);
  assert.deepEqual(initialChatOptions(picked, defaults, alpha, { target: 2, provider: "claude" }), defaults);
  assert.deepEqual(initialChatOptions(picked, defaults, alpha, { target: 1, provider: "codex" }), { ...picked, model: "opus", effort: "high" });
  assert.equal(initialChatOptions(picked, defaults, alpha, alpha), null);
});

test("fitChatOptions: モデルが対応していない深さ・Auto mode・ファストモードを外し、合っていれば同じ物を返す。モデルが分からなければ外さない", () => {
  const models = [m("haiku", "Haiku 5", { efforts: ["low"], supports_auto_mode: false, supports_fast_mode: false }), m("opus", "Opus 5.5", { efforts: ["low", "high"], supports_fast_mode: true })];
  const options: ChatOptions = { model: "haiku", effort: "high", permission_mode: "auto", fast_mode: true };
  assert.deepEqual(fitChatOptions(options, models, "claude"), { model: "haiku", effort: null, permission_mode: "default", fast_mode: false });
  const fine: ChatOptions = { model: "opus", effort: "high", permission_mode: "auto", fast_mode: true };
  assert.equal(fitChatOptions(fine, models, "claude"), fine);
  // 一覧の外のモデル（Claude Code はそのまま通す）・一覧が届く前は、ほかを外さない
  const unknown: ChatOptions = { ...options, model: "claude-opus-4-1" };
  assert.equal(fitChatOptions(unknown, models, "claude"), unknown);
  assert.equal(fitChatOptions(options, [], "codex"), options);
  // ほかの AI のモデルは、その AI の既定のモデルにしてから合わせる
  const codex = [m("gpt-6-luna", "GPT-6 Luna", { is_default: true, efforts: ["low"], supports_auto_mode: true })];
  assert.deepEqual(fitChatOptions(options, codex, "codex"), { model: "gpt-6-luna", effort: null, permission_mode: "auto", fast_mode: false });
});
