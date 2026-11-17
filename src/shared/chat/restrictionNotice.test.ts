import { test } from "vitest";
import assert from "node:assert/strict";
import { restrictionNotice } from "./restrictionNotice";

test("制限を外したときは新規の送信前と既存のチャットに知らせる", () => {
  assert.equal(restrictionNotice(true, true), "");
  assert.equal(restrictionNotice(undefined, undefined), "");
  assert.match(restrictionNotice(false, true, true), /新しいチャットの既定.*サンドボックス.*オフ/);
  assert.match(restrictionNotice(true, false), /このチャット.*編集先の制限.*オフ/);
  assert.match(restrictionNotice(false, false), /サンドボックス・編集先の制限.*オフ/);
});
