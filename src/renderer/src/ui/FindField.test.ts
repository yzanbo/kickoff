import assert from "node:assert/strict";
import { test } from "node:test";
import { findCountText } from "./FindField";

test("findCountText: 誤り・空・見つからない・何番目か・まだ移っていない・数えるのをやめた", () => {
  assert.equal(findCountText({ invalid: true, query: "(", total: 0, current: null }), "誤り");
  assert.equal(findCountText({ invalid: false, query: "", total: 3, current: 0 }), "");
  assert.equal(findCountText({ invalid: false, query: "a", total: 0, current: null }), "0 件");
  assert.equal(findCountText({ invalid: false, query: "a", total: 5, current: 1 }), "2/5");
  assert.equal(findCountText({ invalid: false, query: "a", total: 5, current: null }), "5 件");
  assert.equal(findCountText({ invalid: false, query: "a", total: 19999, current: 0, capped: true }), "1/19999+");
  assert.equal(findCountText({ invalid: false, query: "a", total: 19999, current: null, capped: true }), "19999+ 件");
});
