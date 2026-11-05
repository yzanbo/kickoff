import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentState } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { inboxSections, waitingSince } from "./inboxOrder";

const at = (min: number) => new Date(Date.UTC(2026, 10, 5, 0, min)).toISOString();

test("inboxSections: 回答待ち → エラー → 未読の見出しに分け、見出しの中は待ち始めた時刻の古い順。作業中・既読・アーカイブ済みは入れない", () => {
  const chats = [
    makeChat(1, { active_at: at(30) }),
    makeChat(2, { active_at: at(10) }),
    makeChat(3, { active_at: at(20) }),
    makeChat(4, { active_at: at(5) }),
    makeChat(5, { active_at: at(1) }),
    makeChat(6, { active_at: at(2), archived_at: at(3) }),
    makeChat(7, { active_at: at(4) }),
  ];
  const states: Record<number, AgentState> = { 1: "unread", 2: "unread", 3: "needs_input", 4: "failed", 5: "running", 6: "unread", 7: "read" };
  const sections = inboxSections(chats, (c) => states[c.id], (c) => c.active_at);
  assert.deepEqual(
    sections.map((s) => [s.state, s.chats.map((c) => c.id)]),
    [
      ["needs_input", [3]],
      ["failed", [4]],
      ["unread", [2, 1]],
    ],
  );
});

test("waitingSince: 回答待ちはいちばん古い依頼が届いた時刻（依頼がなければ最後に動いた時刻）、ほかは最後に動いた時刻", () => {
  const chat = makeChat(1, { active_at: at(30) });
  const approvals = [
    { chat_id: 1, created_at: at(12) },
    { chat_id: 1, created_at: at(8) },
    { chat_id: 2, created_at: at(1) },
  ];
  assert.equal(waitingSince(chat, "needs_input", approvals), at(8));
  assert.equal(waitingSince(chat, "needs_input", []), at(30));
  assert.equal(waitingSince(chat, "unread", approvals), at(30));
});
