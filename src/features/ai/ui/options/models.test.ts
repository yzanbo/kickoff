import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatOptions, ModelOption } from "@shared/chat/types";
import { fallbackModel, fastSupportOf, groupModels, modelDisplayName, splitModelLabel, withDefaults } from "./models";

const m = (value: string, label: string): ModelOption => ({ value, label, description: "", efforts: [], supports_auto_mode: true, supports_fast_mode: false });

test("Fast の対応情報があるときだけ操作可能。取得中・取得不能と非対応は分ける", () => {
  const model = m("opus", "Opus");
  assert.equal(fastSupportOf({ ...model, supports_fast_mode: true }, false), "supported");
  assert.equal(fastSupportOf({ ...model, supports_fast_mode: false }, false), "unsupported");
  assert.equal(fastSupportOf(undefined, true), "loading");
  assert.equal(fastSupportOf(undefined, false), "unknown");
  assert.equal(fastSupportOf({ ...model, supports_fast_mode: null }, false), "unknown");
  assert.equal(fastSupportOf({ ...model, supports_fast_mode: null }, true), "loading");
});

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

test("Codex は Astra → Sol → Terra → Luna にまとめ、各系統を新しい世代順に並べる", () => {
  const sol = { ...m("gpt-6.1-sol", "GPT-6.1-Sol"), description: "Latest workhorse model." };
  const groups = groupModels([
    sol,
    m("gpt-6-astra", "GPT-6-Astra"),
    m("gpt-6.1-terra", "GPT-6.1 Terra"),
    m("gpt-6-sol", "GPT-6-Sol"),
    m("gpt-6-luna", "GPT-6-Luna"),
    m("gpt-6.1-astra", "GPT-6.1-Astra"),
  ]);
  assert.deepEqual(groups.map((g) => [g.family, g.items.map((i) => [i.value, i.version])]), [
    ["Astra", [["gpt-6.1-astra", "6.1"], ["gpt-6-astra", "6.0"]]],
    ["Sol", [["gpt-6.1-sol", "6.1"], ["gpt-6-sol", "6.0"]]],
    ["Terra", [["gpt-6.1-terra", "6.1"]]],
    ["Luna", [["gpt-6-luna", "6.0"]]],
  ]);
  assert.equal(groups[1].items[0].description, sol.description);
});

test("Codex の名前はハイフン・空白・大文字小文字に対応し、未知の系統や派生モデルは名前を残す", () => {
  assert.deepEqual(splitModelLabel("GPT-6.1-Sol"), { family: "Sol", version: "6.1" });
  assert.deepEqual(splitModelLabel("GPT-6.1 Terra"), { family: "Terra", version: "6.1" });
  assert.deepEqual(splitModelLabel("gpt-6-astra"), { family: "Astra", version: "6.0" });
  for (const label of ["GPT-6.1-Sol-preview", "GPT-6-NewFamily", "GPT-6", "Custom model"]) {
    assert.deepEqual(splitModelLabel(label), { family: label, version: "" });
  }
  assert.equal(modelDisplayName([m("gpt-6.1-sol", "GPT-6.1-Sol")], "gpt-6.1-sol"), "Sol 6.1");
});

test("バージョンは小数ではなく各桁の数字で比較し、表記違いの同一世代は最初の選択肢を残す", () => {
  const groups = groupModels([
    m("sol-6-9", "GPT-6.9-Sol"),
    m("sol-6-10", "GPT-6.10-Sol"),
    m("sol-6-10-alias", "GPT-6.10 Sol"),
    m("sol-6", "GPT-6-Sol"),
  ]);
  assert.deepEqual(groups.map((g) => [g.family, g.items.map((i) => [i.value, i.version])]), [
    ["Sol", [["sol-6-10", "6.10"], ["sol-6-9", "6.9"], ["sol-6", "6.0"]]],
  ]);
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
