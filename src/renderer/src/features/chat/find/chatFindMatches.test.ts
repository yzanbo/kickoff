import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEventType } from "@shared/types";
import { makeEvent, type EventInput } from "@shared/testing/factories";
import { DEFAULT_FIND_OPTIONS, findPattern } from "@/lib/textFind";
import { findMatches as findMatchesOf } from "./chatFindMatches";
import type { TimelineItem } from "@/features/chat/timeline/timelineItems";

/** 打った文と探し方から探す（画面と同じく findPattern で形を作る） */
const findMatches = (items: TimelineItem[], query: string, caseSensitive = false) => findMatchesOf(items, findPattern(query, { ...DEFAULT_FIND_OPTIONS, caseSensitive }));

const item = <T extends ChatEventType>(id: number, type: T, data: EventInput<T>): TimelineItem => ({ kind: "event", key: `e${id}`, event: makeEvent(id, type, data) });

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
});

test("チャットの中の検索: 単語単位・正規表現でも探し、正規表現の誤りでは何も探さない", () => {
  const items: TimelineItem[] = [item(1, "user", { text: "cat concat cat" }), item(2, "text", { text: "v1.2 と v10" })];
  assert.deepEqual(findMatchesOf(items, findPattern("cat", { ...DEFAULT_FIND_OPTIONS, wholeWord: true })), [
    { eventId: 1, nth: 0 },
    { eventId: 1, nth: 1 },
  ]);
  assert.deepEqual(findMatchesOf(items, findPattern(String.raw`v\d+`, { ...DEFAULT_FIND_OPTIONS, regex: true })), [
    { eventId: 2, nth: 0 },
    { eventId: 2, nth: 1 },
  ]);
  assert.deepEqual(findMatchesOf(items, findPattern("(", { ...DEFAULT_FIND_OPTIONS, regex: true })), []);
});
