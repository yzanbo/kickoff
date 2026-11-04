import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { findMatches } from "./chatFindMatches.js";
import type { TimelineItem } from "./timelineItems.js";

const item = (id: number, type: string, data: object): TimelineItem => ({ kind: "event", key: `e${id}`, event: { id, type, data } as unknown as RunEvent });

test("チャットの中の検索: 自分の発言と AI の返答から、流れの順に、発言の中の何番目かを添えて探す", () => {
  const items: TimelineItem[] = [
    item(1, "user", { text: "Kickoff の画面を直して" }),
    item(2, "text", { text: "画面を確認します。画面は…" }),
    item(3, "thinking", { text: "画面" }),
    item(4, "text", { text: "サブの画面", sub: true }),
    { kind: "tools", key: "t5", tools: [] },
    item(6, "text", { text: "KICKOFF" }),
  ];
  assert.deepEqual(findMatches(items, "画面"), [
    { eventId: 1, nth: 0 },
    { eventId: 2, nth: 0 },
    { eventId: 2, nth: 1 },
  ]);
  assert.deepEqual(findMatches(items, " kickoff "), [
    { eventId: 1, nth: 0 },
    { eventId: 6, nth: 0 },
  ]);
  assert.deepEqual(findMatches(items, "  "), []);
});
