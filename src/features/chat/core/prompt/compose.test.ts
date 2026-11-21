import { test } from "vitest";
import assert from "node:assert/strict";
import { appendSections } from "./compose";

test("文の後ろに空でない節を空行 1 つでつなぐ（節がなければ文のまま・文が空白だけなら節だけ）", () => {
  assert.equal(appendSections("指示", "添付:\n- a", null, ""), "指示\n\n添付:\n- a");
  assert.equal(appendSections("指示", null), "指示");
  assert.equal(appendSections("  ", "添付:\n- a"), "添付:\n- a");
  assert.equal(appendSections("  "), "  ");
});

test("文脈をつなぐときは文を null にする（どれもなければ null）", () => {
  assert.equal(appendSections(null, "家系", null, "移動の知らせ"), "家系\n\n移動の知らせ");
  assert.equal(appendSections(null, null, ""), null);
});
