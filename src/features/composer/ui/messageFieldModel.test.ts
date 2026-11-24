import assert from "node:assert/strict";
import { test } from "vitest";
import type { KeyInput } from "@/foundation/ui/lib/keys";
import { fieldKeyAction, submitHowOf } from "./messageFieldModel";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
const no = () => false;
const base = { recording: false, metaShift: false, cancellable: false, caller: no, voice: no };

test("fieldKeyAction: Enter は送る・Shift+Enter は改行・変換を確定する Enter は送らない", () => {
  assert.equal(fieldKeyAction(key("Enter"), base), "submit");
  assert.equal(fieldKeyAction(key("Enter", { metaKey: true }), base), "submit");
  assert.equal(fieldKeyAction(key("Enter", { shiftKey: true }), base), null);
  assert.equal(fieldKeyAction(key("Enter", { keyCode: 229 }), base), null);
  // ⌘⇧Enter はチャット欄（metaShift）だけ送る
  assert.equal(fieldKeyAction(key("Enter", { metaKey: true, shiftKey: true }), base), null);
  assert.equal(fieldKeyAction(key("Enter", { metaKey: true, shiftKey: true }), { ...base, metaShift: true }), "submit");
});

test("fieldKeyAction: 録音中の送る Enter は、呼ぶ側（候補の一覧）より先に、文字にしてから送る", () => {
  let asked = false;
  const caller = () => (asked = true);
  assert.equal(fieldKeyAction(key("Enter"), { ...base, recording: true, caller }), "voiceSend");
  assert.equal(asked, false);
  // 録音中でも Shift+Enter は改行（呼ぶ側に渡す）
  assert.equal(fieldKeyAction(key("Enter", { shiftKey: true }), { ...base, recording: true, caller }), "handled");
});

test("fieldKeyAction: 呼ぶ側 → 音声 → Enter → Esc の順に見る", () => {
  const order: string[] = [];
  const caller = () => (order.push("caller"), false);
  const voice = () => (order.push("voice"), true);
  assert.equal(fieldKeyAction(key("Escape"), { ...base, cancellable: true, caller, voice }), "handled");
  assert.deepEqual(order, ["caller", "voice"]);
  assert.equal(fieldKeyAction(key("Escape"), { ...base, cancellable: true }), "cancel");
  // やめる口がなければ Esc は扱わない（パネルを閉じる Esc に任せる）
  assert.equal(fieldKeyAction(key("Escape"), base), null);
  // 変換をやめる Esc はやめない
  assert.equal(fieldKeyAction(key("Escape", { isComposing: true }), { ...base, cancellable: true }), null);
});

test("submitHowOf: 押していた ⌘ と Shift", () => {
  assert.deepEqual(submitHowOf(key("Enter", { metaKey: true, shiftKey: true })), { meta: true, shift: true });
  assert.deepEqual(submitHowOf(key("Enter")), { meta: false, shift: false });
});
