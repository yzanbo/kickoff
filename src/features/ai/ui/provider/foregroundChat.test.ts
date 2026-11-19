import assert from "node:assert/strict";
import { test } from "vitest";
import { nextForegroundChat, type ForegroundChat } from "./foregroundChat";

test("同じチャットを触っただけなら同じものを返し、チャット・AI が変わったときだけ新しくする", () => {
  const initial: ForegroundChat = { provider: null, key: null };
  const chat = nextForegroundChat(initial, "codex", "chat:1");
  assert.deepEqual(chat, { provider: "codex", key: "chat:1" });
  assert.equal(nextForegroundChat(chat, "codex", "chat:1"), chat);
  assert.notEqual(nextForegroundChat(chat, "codex", "chat:2"), chat);
  assert.notEqual(nextForegroundChat(chat, "claude", "chat:1"), chat);
});
