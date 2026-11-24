import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import type { AgentState } from "@shared/chat/types";
import { childActivityOf, descendantRows, handBackText } from "./childChats";

test("handBackText: どの子チャットの答えかを添えて、答えを引用にする（空行も引用の中に残す）", () => {
  assert.equal(handBackText({ title: "違い" }, "A です。\n\nB です。\n"), "子チャット「違い」の答え:\n> A です。\n>\n> B です。\n\n");
  assert.equal(handBackText({ title: "" }, "x"), "子チャット「Untitled Chat」の答え:\n> x\n\n");
});

test("childActivityOf: 子孫と、その中の作業中・回答待ちを数え、回答待ちがあれば回答待ちにする（アーカイブ済みとその下は数えない）", () => {
  const states = new Map<number, AgentState>([
    [2, "running"],
    [3, "read"],
    [4, "running"],
    [5, "needs_input"],
    [6, "running"],
  ]);
  const childrenOf = new Map([
    [1, [makeChat(2, { parent_chat_id: 1 }), makeChat(3, { parent_chat_id: 1 }), makeChat(5, { parent_chat_id: 1, archived_at: "2026-11-11T00:00:00Z" })]],
    [3, [makeChat(4, { parent_chat_id: 3 })]],
    [5, [makeChat(6, { parent_chat_id: 5 })]],
  ]);
  const stateOf = (c: { id: number }) => states.get(c.id) ?? "read";
  // 子の 2・孫の 4 が作業中（アーカイブ済みの 5 とその下の 6 は数えない）
  assert.deepEqual(childActivityOf(1, childrenOf, stateOf), { state: "running", count: 2, total: 3 });
  // 子チャットのタブでは、その下（孫）だけ
  assert.deepEqual(childActivityOf(3, childrenOf, stateOf), { state: "running", count: 1, total: 1 });
  assert.equal(childActivityOf(2, childrenOf, stateOf), null);
  // 子孫がどれも動いていなければ idle（子チャットがあることは出す）
  states.set(4, "read");
  assert.deepEqual(childActivityOf(3, childrenOf, stateOf), { state: "idle", count: 0, total: 1 });
  states.set(4, "running");
  states.set(3, "needs_input");
  assert.deepEqual(childActivityOf(1, childrenOf, stateOf), { state: "needs_input", count: 3, total: 3 });
});

test("descendantRows: 子の下に孫が続く順に並べ、兄弟は最後に動いた順・深さを添える（アーカイブ済みとその下・輪は入れない）", () => {
  const at = (h: number) => `2026-11-12T0${h}:00:00Z`;
  const childrenOf = new Map([
    [1, [makeChat(2, { parent_chat_id: 1, active_at: at(1) }), makeChat(3, { parent_chat_id: 1, active_at: at(3) }), makeChat(5, { parent_chat_id: 1, archived_at: at(2) })]],
    [2, [makeChat(4, { parent_chat_id: 2, active_at: at(2) })]],
    [5, [makeChat(6, { parent_chat_id: 5 })]],
    [4, [makeChat(1, { parent_chat_id: 4 })]],
  ]);
  assert.deepEqual(
    descendantRows(1, childrenOf).map((r) => [r.chat.id, r.depth]),
    [
      [3, 1],
      [2, 1],
      [4, 2],
    ],
  );
  assert.deepEqual(descendantRows(3, childrenOf), []);
});
