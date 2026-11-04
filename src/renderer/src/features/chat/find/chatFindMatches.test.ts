import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent } from "@shared/types";
import { findMatches, matchOffsets } from "./chatFindMatches";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";

const item = (id: number, type: string, data: object): TimelineItem => ({ kind: "event", key: `e${id}`, event: { id, type, data } as unknown as ChatEvent });

test("チャットの中の検索: 自分の発言と AI の返答から、流れの順に、発言の中の何番目かを添えて探す", () => {
  const items: TimelineItem[] = [
    item(1, "user", { text: "Kickoff の画面を直して" }),
    item(2, "text", { text: "画面を確認します。画面は…" }),
    item(3, "thinking", { text: "画面" }),
    item(4, "text", { text: "サブの画面", parent: "agent1" }),
    { kind: "tools", key: "t5", tools: [] },
    item(6, "text", { text: "KICKOFF" }),
  ];
  assert.deepEqual(findMatches(items, "画面"), [
    { eventId: 1, nth: 0 },
    { eventId: 2, nth: 0 },
    { eventId: 2, nth: 1 },
  ]);
  assert.deepEqual(findMatches(items, "kickoff"), [
    { eventId: 1, nth: 0 },
    { eventId: 6, nth: 0 },
  ]);
  // 大文字・小文字を区別する
  assert.deepEqual(findMatches(items, "KICKOFF", true), [{ eventId: 6, nth: 0 }]);
  assert.deepEqual(findMatches(items, "kickoff", true), []);
  assert.deepEqual(findMatches(items, ""), []);
});

test("チャットの中の検索: 打った空白（半角・全角）も削らずに探す", () => {
  const items: TimelineItem[] = [item(1, "user", { text: "a b　c  d" }), item(2, "text", { text: "Kickoff の画面" })];
  assert.deepEqual(findMatches(items, " "), [
    { eventId: 1, nth: 0 },
    { eventId: 1, nth: 1 },
    { eventId: 1, nth: 2 },
    { eventId: 2, nth: 0 },
  ]);
  assert.deepEqual(findMatches(items, "　"), [{ eventId: 1, nth: 0 }]);
  assert.deepEqual(findMatches(items, "Kickoff "), [{ eventId: 2, nth: 0 }]);
  assert.deepEqual(findMatches(items, " Kickoff"), []);
  assert.deepEqual(matchOffsets("aAaA", "a", true), [0, 2]);
});
