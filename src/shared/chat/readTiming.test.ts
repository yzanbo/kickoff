import assert from "node:assert/strict";
import { test } from "vitest";
import { createReadHolds, readPillOf, readToggleOf, seenToSend } from "./readTiming";
import { makeEvent } from "./testing";

test("readToggleOf: 作業が終わったチャットだけを切り替え、作業中・回答待ちは切り替えない", () => {
  assert.equal(readToggleOf("unread"), "seen");
  // 見るまで未読の失敗も、既読にする
  assert.equal(readToggleOf("failed"), "seen");
  assert.equal(readToggleOf("read"), "unseen");
  assert.equal(readToggleOf("running"), null);
  assert.equal(readToggleOf("needs_input"), null);
});

test("readPillOf: ボタンで既読にする設定で、一番下まで来たら、未読なら既読ボタン・既読なら既読の表示", () => {
  assert.equal(readPillOf("button", "unread", true), "unread");
  assert.equal(readPillOf("button", "failed", true), "unread");
  assert.equal(readPillOf("button", "read", true), "read");
  // 一番下まで来ていなければ出さない
  assert.equal(readPillOf("button", "unread", false), null);
  assert.equal(readPillOf("button", "read", false), null);
  // 作業中・回答待ちは未読・既読がないので出さない
  for (const state of ["running", "needs_input"] as const) assert.equal(readPillOf("button", state, true), null);
  // 一番下まで見たら既読にする設定では出さない（自動で既読にする）
  assert.equal(readPillOf("at_bottom", "unread", true), null);
  assert.equal(readPillOf("at_bottom", "read", true), null);
});

/** 返答の文・作業の終わり・ツールの実行 */
const events = [makeEvent(1, "text", { text: "返答" }), makeEvent(2, "result", { status: "completed" }), makeEvent(3, "tool_use", { id: "t", name: "Read", input: {} })];

test("seenToSend: 一番下まで見たら既読にする設定で、未読か新しい結果があるときだけ、見た所までの記録で送る", () => {
  const base = { timing: "at_bottom", chat: { unread: true }, events, held: false, sentUpTo: 0 } as const;
  // 見た所 = 最後の記録、覚えるのは最後の新しい結果（ツールの実行は数えない）
  assert.deepEqual(seenToSend(base), { upTo: 2, eventId: 3 });
  // 印がなくても、前に送ったより新しい結果があれば送る（作業中に届いた返答を一番下で見た）
  assert.deepEqual(seenToSend({ ...base, chat: { unread: false }, sentUpTo: 1 }), { upTo: 2, eventId: 3 });
  // 印がなく、新しい結果も送り済みなら送らない
  assert.equal(seenToSend({ ...base, chat: { unread: false }, sentUpTo: 2 }), null);
  // 手で未読にした覚えがある間・ボタンで既読にする設定では送らない
  assert.equal(seenToSend({ ...base, held: true }), null);
  assert.equal(seenToSend({ ...base, timing: "button" }), null);
});

test("createReadHolds: 手で未読にした覚えは、外すか作業が始まって最後に動いた時刻が進むまで効く", () => {
  const holds = createReadHolds();
  const chat = { id: 1, active_at: "2026-11-26T00:00:00.000Z" };
  assert.equal(holds.isHeld(chat), false);
  holds.hold(chat);
  assert.equal(holds.isHeld(chat), true);
  assert.equal(holds.isHeld({ id: 2, active_at: chat.active_at }), false);
  // 返信を送って状態が変わると、最後に動いた時刻が進む
  assert.equal(holds.isHeld({ ...chat, active_at: "2026-11-26T00:01:00.000Z" }), false);
  holds.release(chat.id);
  assert.equal(holds.isHeld(chat), false);
});
