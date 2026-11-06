// 会話を引き継げる作業の終わり・発言を送ったときのセッションのテスト（コンテキストの消去を境にする）
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import type { ChatEvent } from "@shared/types";
import { resumePointBefore, sessionAt } from "./sessionPoints.js";

const ev = eventSequence();
const events: ChatEvent[] = [
  ev("user", { text: "1", message_uuid: "u1" }),
  ev("init", { session_id: "s1" }),
  ev("result", { status: "completed", session_id: "s1", message_id: "m1" }),
  ev("user", { text: "2", message_uuid: "u2" }),
  ev("result", { status: "cancelled", session_id: "s1", message_id: "m2" }),
  ev("context_cleared", {}),
  ev("user", { text: "3", message_uuid: "u3" }),
  ev("init", { session_id: "s2" }),
  ev("result", { status: "completed", session_id: "s2", message_id: "m3" }),
];

test("resumePointBefore: 最後まで終わった作業の終わりだけを数え、間にコンテキストの消去があれば引き継がない", () => {
  assert.equal(resumePointBefore(events, 4)?.message_id, "m1");
  // 中断した作業の終わりは飛ばす
  assert.equal(resumePointBefore(events, 5)?.message_id, "m1");
  // 消去のあとの最初の発言からは、最初から
  assert.equal(resumePointBefore(events, 6), undefined);
  assert.equal(resumePointBefore(events, 7), undefined);
  // 消去のあとに終わった作業があれば、それを起点にする
  assert.equal(resumePointBefore(events)?.message_id, "m3");
  assert.equal(resumePointBefore(events.slice(0, 7)), undefined);
});

test("sessionAt: あとでコンテキストを消去していれば、消去の直前のセッション", () => {
  assert.equal(sessionAt(events, 0, "s2"), "s1");
  assert.equal(sessionAt(events, 3, "s2"), "s1");
  assert.equal(sessionAt(events, 6, "s2"), "s2");
  assert.equal(sessionAt(events.slice(0, 6), 0, null), "s1");
  assert.equal(sessionAt([events[0], events[5]], 0, null), null);
});
