import assert from "node:assert/strict";
import { test } from "node:test";
import type { Question } from "@shared/types";
import { chosenPreviews, hasPreviews } from "./questionPreviews";

const q = (question: string, options: { label: string; preview?: string }[], multiSelect = false): Question => ({
  question,
  header: "",
  multiSelect,
  options: options.map((o) => ({ description: "", ...o })),
});

test("chosenPreviews: 答えた選択肢の図を質問ごとに。図のない選択肢・「その他」の文・答えていない質問は入れない", () => {
  const questions = [
    q("どちら？", [{ label: "A", preview: "┌A┐" }, { label: "B" }]),
    q("いくつ？", [{ label: "x", preview: "X" }, { label: "y", preview: " Y " }], true),
    q("まだ", [{ label: "z", preview: "Z" }]),
  ];
  assert.deepEqual(chosenPreviews(questions, { "どちら？": "A", "いくつ？": ["y", "x", "自由に書いた"] }), { "どちら？": "┌A┐", "いくつ？": "Y\n\nX" });
  assert.equal(chosenPreviews(questions, { "どちら？": "B" }), undefined);
  assert.equal(chosenPreviews(questions, { "どちら？": "その他の文" }), undefined);
});

test("hasPreviews: 中身のある図が 1 つでもあるか", () => {
  assert.equal(hasPreviews(q("a", [{ label: "1" }, { label: "2", preview: "図" }])), true);
  assert.equal(hasPreviews(q("a", [{ label: "1", preview: "  " }])), false);
});
