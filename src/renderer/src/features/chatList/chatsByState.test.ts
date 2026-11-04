import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentState, Chat } from "@shared/types";
import { chatsByState } from "./StateChatsPopover";

const chat = (id: number, state: AgentState, archived = false) =>
  ({ id, active_at: `2026-11-0${id}T00:00:00Z`, archived_at: archived ? "2026-11-01T00:00:00Z" : null, state }) as unknown as Chat & { state: AgentState };
const chats = [chat(1, "running"), chat(2, "read"), chat(3, "read", true), chat(4, "needs_input")];
const stateOf = (r: Chat) => (r as Chat & { state: AgentState }).state;

test("runsByState: 初めは作業中・回答待ち・未読だけ（既読・アーカイブ済みは入れない）", () => {
  assert.deepEqual(
    chatsByState(chats, stateOf).map((s) => [s.column, s.chats.map((r) => r.id)]),
    [
      ["running", [1]],
      ["needs_input", [4]],
    ],
  );
});

test("runsByState: all なら既読と、いちばん下にアーカイブ済みも並べる", () => {
  assert.deepEqual(
    chatsByState(chats, stateOf, { all: true }).map((s) => [s.column, s.chats.map((r) => r.id)]),
    [
      ["running", [1]],
      ["needs_input", [4]],
      ["read", [2]],
      ["archived", [3]],
    ],
  );
});
