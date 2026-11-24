import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import type { Chat } from "@shared/chat/types";
import { childChatHandOff } from "./handOffTarget";

const at = (mainChat: Chat | null) => ({ mainChat, inner: null });

test("新しい子チャットで聞く: 足す先のチャットがない・ノートのチャット・アーカイブしたチャットでは出さない", () => {
  assert.equal(childChatHandOff.label(at(makeChat(1))), "新しい子チャットで聞く");
  assert.equal(childChatHandOff.label(at(null)), null);
  assert.equal(childChatHandOff.label(at(makeChat(1, { note_path: "a.md" }))), null);
  assert.equal(childChatHandOff.label(at(makeChat(1, { archived_at: "2026-11-22T00:00:00Z" }))), null);
});
