import assert from "node:assert/strict";
import { test } from "vitest";
import { commitValue, followValue } from "./commitText";

test("followValue: ピントのある間はほかで値が変わっても書きかけを残し、外れたら合わせる", () => {
  assert.equal(followValue({ text: "書きかけ", base: "a", value: "b", focused: true }), null);
  assert.deepEqual(followValue({ text: "書きかけ", base: "a", value: "b", focused: false }), { text: "b", base: "b" });
  assert.equal(followValue({ text: "書きかけ", base: "a", value: "a", focused: false }), null);
});

test("commitValue: 変えた文字だけを空白を除いて保存し、変えていなければ外の値を上書きしない", () => {
  assert.equal(commitValue({ text: " x ", base: "a", value: "a" }), "x");
  assert.equal(commitValue({ text: "a", base: "a", value: "b" }), null);
  assert.equal(commitValue({ text: "b ", base: "a", value: "b" }), null);
  assert.equal(commitValue({ text: " ", base: "a", value: "a" }), "");
  assert.equal(commitValue({ text: " ", base: "a", value: "a" }, { required: true }), null);
});
