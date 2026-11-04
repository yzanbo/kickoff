import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { approvalIndex } from "@/features/chat/chatState";
import { chatsByState } from "./StateChatsPopover";

const chat = (id: number, patch: Partial<Chat> = {}) => makeChat(id, { active_at: `2026-11-0${id}T00:00:00Z`, ...patch });
const chats = [chat(1, { status: "running" }), chat(2), chat(3, { archived_at: "2026-11-01T00:00:00Z" }), chat(4, { status: "running" }), chat(5)];
// 4 は回答待ちの依頼がある
const pending = approvalIndex([{ chat_id: 4 }]);

test("chatsByState: 初めは作業中・回答待ち・未読だけ（既読・アーカイブ済みは入れない）", () => {
  assert.deepEqual(
    chatsByState(chats, pending).map((s) => [s.key, s.chats.map((r) => r.id)]),
    [
      ["status:running", [1]],
      ["status:needs_input", [4]],
    ],
  );
});

test("chatsByState: all なら既読と、いちばん下にアーカイブ済みも並べる（中は最後に動いた順）", () => {
  assert.deepEqual(
    chatsByState(chats, pending, { all: true }).map((s) => [s.key, s.label, s.chats.map((r) => r.id)]),
    [
      ["status:running", "作業中", [1]],
      ["status:needs_input", "回答待ち", [4]],
      ["status:read", "既読", [5, 2]],
      ["archived", "アーカイブ済み", [3]],
    ],
  );
});
