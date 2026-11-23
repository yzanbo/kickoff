import assert from "node:assert/strict";
import { test } from "vitest";
import { agentStateOf, boardColumnOf } from "./state";
import { makeChat } from "@shared/chat/testing";
import type { Chat } from "./types";

/** 作業中・既読のチャットと、項目を変えたチャットを作る補助 */
function mk() {
  const chat = makeChat(1, { status: "running", unread: false });
  return { chat, with: (patch: Partial<Chat>) => ({ ...chat, ...patch }) };
}

test("エージェントの状態は 回答待ち → 失敗 → 作業中 → 未読 → 既読 の優先順で決まる（失敗も見たら既読）", () => {
  const { chat, with: w } = mk();
  assert.equal(agentStateOf(chat, true), "needs_input");
  assert.equal(agentStateOf(chat, false), "running");
  assert.equal(agentStateOf(w({ status: "failed", unread: true }), false), "failed");
  assert.equal(agentStateOf(w({ status: "failed", unread: false }), false), "read");
  assert.equal(agentStateOf(w({ status: "completed", unread: true }), false), "unread");
  assert.equal(agentStateOf(w({ status: "completed", unread: false }), false), "read");
});

test("カンバンの列は AI の状態だけで決まる（作業中 → 回答待ち → 未読（失敗も）→ 既読）", () => {
  const { chat, with: w } = mk();
  assert.equal(boardColumnOf(agentStateOf(chat, false)), "running");
  assert.equal(boardColumnOf(agentStateOf(chat, true)), "needs_input");
  assert.equal(boardColumnOf(agentStateOf(w({ status: "completed", unread: true }), false)), "unread");
  assert.equal(boardColumnOf(agentStateOf(w({ status: "failed", unread: true }), false)), "unread");
  assert.equal(boardColumnOf(agentStateOf(w({ status: "completed", unread: false }), false)), "read");
  assert.equal(boardColumnOf(agentStateOf(w({ status: "failed", unread: false }), false)), "read");
});
