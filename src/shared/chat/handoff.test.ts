import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import { handoffAfterFor, handoffRequestPrompt, lastReplyOfTurn } from "./handoff";

test("handoffRequestPrompt: 子チャットの名前を頭の文に入れる（名前がなければ Untitled Chat）", () => {
  const text = handoffRequestPrompt("違いの調査");
  assert.ok(text.startsWith("親チャットに渡す依頼文を書いてください。\n\n"));
  assert.ok(text.includes("- 頭は「子チャット「違いの調査」で検討した結果、次をお願いします。」で始める。"));
  assert.ok(text.endsWith("- このあと依頼文を直すよう頼まれたら、直した依頼文の全文だけを書く。"));
  assert.ok(handoffRequestPrompt("  ").includes("子チャット「Untitled Chat」で検討した結果"));
});

test("lastReplyOfTurn: 作業の終わりの直前のメインのひと続きの返答だけ（途中の文・サブエージェント・思考は入れない）", () => {
  const ev = eventSequence();
  const events = [
    ev("user", { text: "依頼文を", message_uuid: "u1" }),
    ev("text", { text: "確認します" }),
    ev("tool_use", { id: "t1", name: "Read", input: {} }),
    ev("tool_result", { tool_use_id: "t1", content: "x", is_error: false }),
    ev("text", { text: "サブの文", parent: "a1" }),
    ev("thinking", { text: "" }),
    ev("text", { text: "子チャット「x」で検討した結果、" }),
    ev("text", { text: "次をお願いします。" }),
    ev("result", { status: "completed" }),
    ev("user", { text: "次", message_uuid: "u2" }),
    ev("tool_use", { id: "t2", name: "Read", input: {} }),
    ev("result", { status: "completed" }),
  ];
  assert.equal(lastReplyOfTurn(events, events[8].id), "子チャット「x」で検討した結果、\n\n次をお願いします。");
  // 返答のない作業・知らない記録は null
  assert.equal(lastReplyOfTurn(events, events[11].id), null);
  assert.equal(lastReplyOfTurn(events, 9999), null);
});

test("handoffAfterFor: 入力欄に入れたときは削除の代わりにアーカイブ", () => {
  assert.equal(handoffAfterFor("delete", "composer"), "archive");
  assert.equal(handoffAfterFor("delete", "send"), "delete");
  assert.equal(handoffAfterFor("archive", "composer"), "archive");
  assert.equal(handoffAfterFor("keep", "queue"), "keep");
});
