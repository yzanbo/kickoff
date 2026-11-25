import { test } from "vitest";
import assert from "node:assert/strict";
import { chatRestrictions, restrictionNotice } from "./restrictionNotice";

test("制限を外したときは新規の送信前と既存のチャットに知らせる", () => {
  assert.equal(restrictionNotice(true, true), "");
  assert.equal(restrictionNotice(undefined, undefined), "");
  assert.match(restrictionNotice(false, true, true), /新しいチャットの既定.*サンドボックス.*オフ/);
  assert.match(restrictionNotice(true, false), /このチャット.*編集先の制限.*オフ/);
  assert.match(restrictionNotice(false, false), /サンドボックス・編集先の制限.*オフ/);
});

test("共通のチャットは、チャットでオフにしてもコマンドのサンドボックスと編集先の制限が効く（プロジェクトのチャットはチャットの値のまま）", () => {
  const off = { sandbox_enabled: false, edit_scope_enabled: false };
  assert.deepEqual(chatRestrictions(off, true), { sandboxEnabled: true, editScopeEnabled: true });
  assert.deepEqual(chatRestrictions(off, false), { sandboxEnabled: false, editScopeEnabled: false });
  assert.deepEqual(chatRestrictions({ sandbox_enabled: true, edit_scope_enabled: false }, false), { sandboxEnabled: true, editScopeEnabled: false });
});
