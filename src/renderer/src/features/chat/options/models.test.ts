import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelOption } from "@shared/types";
import { groupModels, modelDisplayName, splitModelLabel } from "./models";

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
