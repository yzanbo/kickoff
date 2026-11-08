import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, FeedItem } from "@shared/types";
import { feedItemOf, feedPlainText, upsertFeedItem } from "./feed";

const textEvent = (id: number, chatId: number, text: string, parent?: string) =>
  ({ id, chat_id: chatId, type: "text", data: { text, ...(parent ? { parent } : {}) }, created_at: `2026-11-0${id}` }) as ChatEvent;
const item = (chatId: number, eventId: number): FeedItem => ({ chat_id: chatId, event_id: eventId, text: `t${eventId}`, created_at: "x" });

test("feedItemOf: メインエージェントの返答だけ（サブエージェント・空・ほかの種類は null）。長ければ切って …", () => {
  assert.deepEqual(feedItemOf(textEvent(1, 5, "  こんにちは ")), { chat_id: 5, event_id: 1, text: "こんにちは", created_at: "2026-11-01" });
  assert.equal(feedItemOf(textEvent(1, 5, "サブ", "tool-1")), null);
  assert.equal(feedItemOf(textEvent(1, 5, "  ")), null);
  assert.equal(feedItemOf({ id: 2, chat_id: 5, type: "user", data: { text: "質問" }, created_at: "x" } as ChatEvent), null);
  assert.equal(feedItemOf(textEvent(1, 5, "あ".repeat(450)))?.text.length, 401);
});

test("upsertFeedItem: そのチャットの返答を入れ替えていちばん前へ。古い記録は無視", () => {
  const items = [item(1, 10), item(2, 8)];
  assert.deepEqual(upsertFeedItem(items, item(2, 11)).map((i) => [i.chat_id, i.event_id]), [[2, 11], [1, 10]]);
  assert.deepEqual(upsertFeedItem(items, item(3, 12)).map((i) => i.chat_id), [3, 1, 2]);
  assert.equal(upsertFeedItem(items, item(1, 9)), items);
});

test("feedPlainText: Markdown の印を外して読みやすい文に", () => {
  assert.equal(feedPlainText("## 結果\n\n**直しました**。`npm test` が通り、[説明](https://x) を見てください。\n\n```ts\nconst a = 1;\n```"), "結果\n直しました。npm test が通り、説明 を見てください。\nconst a = 1;");
  assert.equal(feedPlainText("| a | b |\n|---|---|\n| 1 | 2 |"), "| a | b |\n| 1 | 2 |");
});
