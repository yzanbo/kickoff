import assert from "node:assert/strict";
import { test } from "vitest";
import { makeEvent } from "@shared/foundation/testing/factories";
import { estimateItem, estimateMarkdown, nextCorrection, textLines, wrappedLines, type EstimateContext } from "./rowEstimate";
import type { TimelineItem } from "./timelineItems";

const ctx = (over: Partial<EstimateContext> = {}): EstimateContext => ({
  textWidth: 720,
  scale: 1,
  isOpen: () => false,
  correction: () => 1,
  ...over,
});

const text = (id: number, body: string): TimelineItem => ({ kind: "event", key: `e${id}`, event: makeEvent(id, "text", { text: body }) });
const user = (id: number, body: string): TimelineItem => ({ kind: "event", key: `e${id}`, event: makeEvent(id, "user", { text: body }) });
const use = (id: number) => makeEvent(id, "tool_use", { id: `tu${id}`, name: "Read", input: {} });

test("wrappedLines / textLines: 全角は 1 文字 1em、半角は 0.55em で折り返しを数える", () => {
  // 15px の文字で幅 150px: 全角 10 文字で 1 行、11 文字で 2 行
  assert.equal(wrappedLines("あ".repeat(10), 150, 15), 1);
  assert.equal(wrappedLines("あ".repeat(11), 150, 15), 2);
  // 半角は 18 文字で 148.5px → 1 行、19 文字で 2 行
  assert.equal(wrappedLines("a".repeat(18), 150, 15), 1);
  assert.equal(wrappedLines("a".repeat(19), 150, 15), 2);
  assert.equal(wrappedLines("", 150, 15), 1);
  assert.equal(textLines("あ\nい\n", 150, 15), 3);
});

test("estimateMarkdown: コードブロックは折り返さず行数 × 20 ＋ 帯、図は 200、見出し・表・空行", () => {
  const long = "x".repeat(500);
  assert.equal(estimateMarkdown(["```ts", long, long, "```"].join("\n"), 720), 2 * 20 + 36);
  assert.equal(estimateMarkdown(["```mermaid", "graph TD", "A-->B", "```"].join("\n"), 720), 200);
  assert.equal(estimateMarkdown("# 見出し", 720), 15 * 1.7 + 12);
  assert.equal(estimateMarkdown("| a | b |\n|---|---|\n| 1 | 2 |", 720), 34 * 3);
  assert.equal(estimateMarkdown("", 720), 12);
  // 書きかけ（閉じていない）のコードブロックも、それまでの行で数える
  assert.equal(estimateMarkdown("```\na\nb", 720), 2 * 20 + 36);
});

test("estimateItem: 長い自分の発言は畳んだ高さで頭打ちにし、開いた印があれば頭打ちしない", () => {
  const body = "あ".repeat(4000);
  const closed = estimateItem(user(1, body), ctx());
  assert.equal(closed, 24 + 22 + 16 + 240 + 24);
  const opened = estimateItem(user(1, body), ctx({ isOpen: (k) => k === "um:1" }));
  assert.ok(opened > 1000);
});

test("estimateItem: ツールのまとまりは閉じていれば 30、開いた印で呼び出しの数と開いた呼び出しを足す", () => {
  const tools: TimelineItem = { kind: "tools", key: "t1", tools: [{ use: use(1) }, { use: use(2) }] };
  assert.equal(estimateItem(tools, ctx()), 30);
  assert.equal(estimateItem(tools, ctx({ isOpen: (k) => k === "tg:1" })), 30 + 2 * 28);
  assert.equal(estimateItem(tools, ctx({ isOpen: (k) => k === "tg:1" || k === "tc:2" })), 30 + 2 * 28 + 200);
});

test("estimateItem: 文字の倍率と種類ごとの補正を掛ける", () => {
  const reply = text(1, "こんにちは");
  const base = estimateItem(reply, ctx());
  // 見積もりは px に丸めるので、1px までの差は許す
  assert.ok(Math.abs(estimateItem(reply, ctx({ scale: 2 })) - base * 2) <= 1);
  assert.ok(Math.abs(estimateItem(reply, ctx({ correction: (k) => (k === "text" ? 1.5 : 1) })) - base * 1.5) <= 1);
});

test("nextCorrection: 測った高さ ÷ 見積もりの移動平均（重み 0.1）で、極端な比は丸める", () => {
  assert.equal(nextCorrection(undefined, 200, 100), 0.9 + 0.2);
  assert.ok(Math.abs(nextCorrection(1.1, 100, 100) - (1.1 * 0.9 + 0.1)) < 1e-9);
  // 40 倍は 4 倍に丸める
  assert.equal(nextCorrection(1, 4000, 100), 0.9 + 0.4);
  // 測れていない
  assert.equal(nextCorrection(1.2, 0, 100), 1.2);
});
