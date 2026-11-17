import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatOptions, ModelOption } from "@shared/types";
import { fallbackModel, groupModels, modelDisplayName, splitModelLabel, withDefaults } from "./models";

const m = (value: string, label: string): ModelOption => ({ value, label, description: "", efforts: [], supports_auto_mode: true, supports_fast_mode: false });

test("モデルをファミリーごとにまとめ、Fable → Opus → Sonnet → Haiku、新しいバージョン順に並べる", () => {
  const groups = groupModels([
    m("opus", "Opus 5.5"),
    m("fable", "Fable 5.1"),
    m("haiku", "Haiku 5.5"),
    m("claude-opus-4-8", "Opus 4.8"),
    m("claude-fable-5", "Fable 5"),
    m("claude-opus-5", "Opus 5"),
    m("sonnet", "Sonnet 5.5"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.family, g.items.map((i) => i.version)]),
    [
      ["Fable", ["5.1", "5.0"]],
      ["Opus", ["5.5", "5.0", "4.8"]],
      ["Sonnet", ["5.5"]],
      ["Haiku", ["5.5"]],
    ],
  );
});

test("閉じた状態の表示名と、名前の分解", () => {
  assert.deepEqual(splitModelLabel("Fable 5"), { family: "Fable", version: "5.0" });
  assert.equal(modelDisplayName([m("opus", "Opus 5.5")], "opus"), "Opus 5.5");
  assert.equal(modelDisplayName([], "opus"), "opus");
});

test("withDefaults: 初めて当てるときは、既定が届く前に選んだモデルを残す。プロジェクトを替えたときは、すべてそのプロジェクトの既定にする", () => {
  const defaults: ChatOptions = { model: "opus", effort: "high", permission_mode: "acceptEdits", fast_mode: true };
  const picked: ChatOptions = { model: "fable", effort: null, permission_mode: "default", fast_mode: false };
  assert.deepEqual(withDefaults(picked, defaults, true), { ...defaults, model: "fable" });
  assert.deepEqual(withDefaults({ ...picked, model: null }, defaults, true), defaults);
  assert.deepEqual(withDefaults(picked, defaults, false), defaults);
});

test("一覧にないモデル（ほかの AI のモデル・null）は、その AI の既定のモデルにする。一覧が届くまでと Claude Code は直さない（メモの仕様書「0028」の 9 節）", () => {
  const codex = [m("gpt-6.1-sol", "GPT-6.1 Sol"), { ...m("gpt-6-luna", "GPT-6 Luna"), is_default: true }];
  assert.equal(fallbackModel(codex, "opus", "codex"), "gpt-6-luna");
  assert.equal(fallbackModel(codex, null, "codex"), "gpt-6-luna");
  assert.equal(fallbackModel(codex, "gpt-6.1-sol", "codex"), "gpt-6.1-sol");
  // 既定の印がなければ null（その AI の既定）
  assert.equal(fallbackModel([m("gpt-6.1-sol", "GPT-6.1 Sol")], "opus", "codex"), null);
  assert.equal(fallbackModel([], "opus", "codex"), "opus");
  assert.equal(fallbackModel([m("opus", "Opus 5.5")], "claude-opus-4-1", "claude"), "claude-opus-4-1");
  // 名前は、一覧が届いていれば「既定」、届くまでは「読み込み中…」
  assert.equal(modelDisplayName(codex, null), "既定");
  assert.equal(modelDisplayName([], null), "読み込み中…");
});
