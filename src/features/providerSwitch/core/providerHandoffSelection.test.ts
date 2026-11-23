import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence } from "@shared/chat/testing";
import { HANDOFF_MAX_CHARS, selectProviderHandoff } from "./providerHandoffSelection";

test("AI への引き継ぎは直近 10 往復の利用者とメイン AI の文だけを順番のまま選ぶ", () => {
  const ev = eventSequence();
  const events = [ev("text", { text: "前置き" }), ...Array.from({ length: 12 }, (_, i) => [
    ev("user", { text: `質問${i}` }),
    ev("tool_use", { id: "a", name: "Read", input: {} }),
    ev("text", { text: "子の発言", parent: "a" }),
    ev("text", { text: `答え${i}` }),
  ]).flat()];
  const result = selectProviderHandoff(events);
  assert.equal(result.earlierOmitted, true);
  assert.equal(result.entries.length, 20);
  assert.equal(result.entries[0].event.data.text, "質問2");
  assert.equal(result.entries.at(-1)?.event.data.text, "答え11");
  assert.ok(result.entries.every((entry) => entry.kind === "message"));
});

test("合計上限の境界で発言を切らず古い方を省く", () => {
  const ev = eventSequence();
  const old = ev("user", { text: "古".repeat(1_001) });
  const newest = ev("text", { text: "新".repeat(19_000) });
  const result = selectProviderHandoff([old, newest]);
  assert.deepEqual(result.entries.map((e) => e.event.id), [newest.id]);
  assert.equal(result.textChars, 19_000);
  assert.equal(result.earlierOmitted, true);
});

test("1 発言が 2 万文字を超える場合は全文参照の印を残し、本文を切らない", () => {
  const ev = eventSequence();
  const long = ev("user", { text: "長".repeat(HANDOFF_MAX_CHARS + 1) });
  const answer = ev("text", { text: "回答" });
  const result = selectProviderHandoff([long, answer]);
  assert.equal(result.entries[0].kind, "long_message");
  assert.equal(result.entries[0].event.data.text, long.data.text);
  assert.equal(result.textChars, 2);
  assert.equal(result.earlierOmitted, false);
});

test("以前の AI に戻すときはそのセッションの境界より後だけを対象にする", () => {
  const ev = eventSequence();
  const first = ev("user", { text: "以前" });
  const boundary = ev("text", { text: "以前の回答" });
  const latest = ev("user", { text: "離れていた間" });
  assert.deepEqual(selectProviderHandoff([first, boundary, latest], boundary.id).entries.map((e) => e.event.id), [latest.id]);
});
