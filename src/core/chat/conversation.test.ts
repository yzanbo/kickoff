// AI がほかのチャットの会話を読むツール（read_chat）のやり取りの分け方と、読む範囲の選び方
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import { conversationTurns, formatConversation } from "./conversation.js";

test("conversationTurns: 発言ごとに分け、メインの AI の文だけを集める（サブエージェントの文は省き、ツールは数だけ。最初の発言より前は入れない）", () => {
  const ev = eventSequence();
  const turns = conversationTurns([
    ev("text", { text: "前置き" }),
    ev("user", { text: "調べて" }),
    ev("tool_use", { id: "t1", name: "Read", input: {} }),
    ev("tool_use", { id: "t2", name: "Grep", input: {}, parent: "a1" }),
    ev("text", { text: "サブの文", parent: "a1" }),
    ev("text", { text: "分かりました" }),
    ev("user", { text: "", pre_compact: true }),
    ev("error", { message: "落ちた" }),
  ]);
  assert.deepEqual(
    turns.map((t) => [t.index, t.user, t.replies, t.tools, t.errors]),
    [
      [1, "調べて", ["分かりました"], 1, []],
      [2, "（圧縮前指示）", [], 0, ["落ちた"]],
    ],
  );
});

test("formatConversation: 既定は最後から、before でさかのぼる。初めまで来たらそう書く", () => {
  const ev = eventSequence();
  const events = [1, 2, 3, 4, 5].flatMap((n) => [ev("user", { text: `問${n}` }), ev("text", { text: `答${n}` })]);
  const turns = conversationTurns(events);
  const last = formatConversation("チャット「X」", turns, 2);
  assert.match(last, /全 5 回のうち 4〜5 回目/);
  assert.match(last, /前を読むには before: 4/);
  assert.ok(last.includes("問5") && !last.includes("問3"));
  const earlier = formatConversation("チャット「X」", turns, 3, 4);
  assert.match(earlier, /1〜3 回目/);
  assert.match(earlier, /これが初めのやり取りです/);
  assert.match(formatConversation("チャット「X」", turns, 3, 1), /1 回目より前のやり取りはありません/);
  assert.match(formatConversation("チャット「X」", [], 3), /まだやり取りがありません/);
});

test("formatConversation: 全体が上限を超えたら古いほうから落とす（1 回分は残す）", () => {
  const ev = eventSequence();
  const long = "あ".repeat(3_000);
  const turns = conversationTurns([1, 2, 3, 4, 5, 6].flatMap(() => [ev("user", { text: long }), ev("text", { text: long })]));
  const text = formatConversation("チャット「X」", turns, 6);
  assert.match(text, /全 6 回のうち 4〜6 回目/);
});
