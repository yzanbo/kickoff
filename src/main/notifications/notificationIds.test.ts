import assert from "node:assert/strict";
import { test } from "node:test";
import { chatOfNotificationId, notificationIdOf } from "./notificationIds.js";

test("通知の ID: チャットを埋め込み、起動し直したあとに押されても読み戻せる（毎回変える）", () => {
  const id = notificationIdOf({ projectId: 5, chatId: 14 }, 1000);
  assert.equal(id, "kickoff-chat:5:14:1000");
  assert.deepEqual(chatOfNotificationId(id), { projectId: 5, chatId: 14 });
  assert.notEqual(notificationIdOf({ projectId: 5, chatId: 14 }, 1001), id);
  assert.equal(chatOfNotificationId(notificationIdOf(undefined, 1000)), undefined);
  assert.equal(chatOfNotificationId("other"), undefined);
});
