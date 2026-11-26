import { test } from "vitest";
import assert from "node:assert/strict";
import { chatRestrictions, restrictionNotice, turnRestrictions } from "./restrictionNotice";

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

test("turnRestrictions: 計画モードと［AI で整える］は砂場をかけ、［AI で整える］は書き込み先も絞る。共通はいつも両方", () => {
  const off = { sandbox_enabled: false, edit_scope_enabled: false, permission_mode: "default" as const, untracked_only: false };
  assert.deepEqual(turnRestrictions(off, false), { sandbox: false, editScope: false });
  assert.deepEqual(turnRestrictions(off, true), { sandbox: true, editScope: true });
  assert.deepEqual(turnRestrictions({ ...off, permission_mode: "plan" }, false), { sandbox: true, editScope: false });
  assert.deepEqual(turnRestrictions({ ...off, untracked_only: true }, false), { sandbox: true, editScope: true });
  assert.deepEqual(turnRestrictions({ ...off, sandbox_enabled: true }, false), { sandbox: true, editScope: false });
  assert.deepEqual(turnRestrictions({ ...off, edit_scope_enabled: true }, false), { sandbox: false, editScope: true });
});
