import assert from "node:assert/strict";
import { test } from "node:test";
import { chatOfNotificationId, ciOfNotificationId, notificationIdOf } from "./notificationIds.js";

test("通知の ID: チャットを埋め込み、起動し直したあとに押されても読み戻せる（毎回変える）", () => {
  const id = notificationIdOf({ chat: { projectId: 5, chatId: 14 } }, 1000);
  assert.equal(id, "kickoff-chat:5:14:1000");
  assert.deepEqual(chatOfNotificationId(id), { projectId: 5, chatId: 14 });
  assert.equal(ciOfNotificationId(id), undefined);
  assert.notEqual(notificationIdOf({ chat: { projectId: 5, chatId: 14 } }, 1001), id);
  assert.equal(chatOfNotificationId(notificationIdOf({}, 1000)), undefined);
  assert.equal(chatOfNotificationId("other"), undefined);
});

test("通知の ID: CI の実行を埋め込み、押されたらその実行を開ける", () => {
  const id = notificationIdOf({ ci: { projectId: 3, runId: 43377548818 } }, 1000);
  assert.equal(id, "kickoff-ci:3:43377548818:1000");
  assert.deepEqual(ciOfNotificationId(id), { projectId: 3, runId: 43377548818 });
  assert.equal(chatOfNotificationId(id), undefined);
});
