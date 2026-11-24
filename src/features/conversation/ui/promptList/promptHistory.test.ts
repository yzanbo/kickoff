import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence } from "@shared/chat/testing";
import { CONTEXT_CLEARED_LABEL, promptBefore, promptListOf } from "./promptHistory";

const event = eventSequence();

test("前の発言: 自分の発言だけを新しい順に。添付だけの発言は除き、続けて同じ文は 1 つにまとめる", () => {
  const events = [
    event("user", { text: "一つ目" }),
    event("text", { text: "AI の返答" }),
    event("user", { text: "  二つ目  " }),
    event("user", { text: "二つ目" }),
    event("user", { text: "", attachments: [{ kind: "file", id: "a", name: "a.png", mime: "image/png", size: 1 }] }),
    event("user", { text: "三つ目" }),
  ];
  assert.deepEqual(promptListOf(events).recalls, ["三つ目", "二つ目", "一つ目"]);
  assert.deepEqual(promptListOf([]).recalls, []);
});

test("指示の一覧: 自分の発言を会話の順に（添付だけならファイル名）。同じ記録の配列なら作り直さない", () => {
  const events = [
    event("user", { text: " 調べて " }),
    event("text", { text: "AI の返答" }),
    event("user", { text: "", attachments: [{ kind: "file", id: "a", name: "a.png", mime: "image/png", size: 1 }] }),
    event("result", { status: "completed" }),
  ];
  const list = promptListOf(events);
  assert.deepEqual(list.entries.map((p) => [p.text, p.label]), [["調べて", "調べて"], ["", "a.png"]]);
  assert.deepEqual(list.ids, [events[0].id, events[2].id]);
  assert.equal(list.byId.get(events[2].id)?.attachments.length, 1);
  assert.equal(promptListOf(events), list);
  assert.notEqual(promptListOf([...events]), list);
  // その作業を始めた指示（作業の終わりの記録より前の、いちばん新しい指示）
  assert.equal(promptBefore(list, events[3].id)?.id, events[2].id);
  assert.equal(promptBefore(list, events[0].id), undefined);
});

test("指示の一覧: 圧縮の前に送った圧縮前指示には印を付ける（自分で書いた指示は付けない）", () => {
  const events = [event("user", { text: "調べて" }), event("user", { text: "ノートにまとめて", pre_compact: true }), event("user", { text: "ノートを読み直して", post_compact: true })];
  assert.deepEqual(promptListOf(events).entries.map((p) => p.compactKind), [null, "pre", "post"]);
});

test("指示の履歴: AI からの質問への回答も会話の順に並べ、答えを「 / 」でつなぐ（指示の一覧・↑↓ の呼び出しには入れない）", () => {
  const events = [
    event("user", { text: "調べて" }),
    event("approval_resolved", {
      approval_id: "q1",
      kind: "question",
      action: "answer",
      answers: { "どの形にしますか？": "表", "どこに置きますか？": ["上", "下"] },
      attachments: { "どの形にしますか？": [{ kind: "file", id: "a", name: "a.png", mime: "image/png", size: 1 }] },
    }),
    event("approval_resolved", { approval_id: "t1", kind: "permission", action: "allow" }),
    event("user", { text: "続けて" }),
  ];
  const list = promptListOf(events);
  assert.deepEqual(list.entries.map((p) => p.id), [events[0].id, events[3].id]);
  assert.deepEqual(list.history.map((p) => p.id), [events[0].id, events[1].id, events[3].id]);
  const answer = list.history[1];
  assert.equal(answer.text, "");
  assert.equal(answer.label, "表 / 上、下");
  assert.deepEqual(answer.answers, [
    { question: "どの形にしますか？", answer: "表" },
    { question: "どこに置きますか？", answer: "上、下" },
  ]);
  assert.equal(answer.attachments.length, 1);
  assert.equal(list.history[0].answers, null);
  assert.deepEqual(list.recalls, ["続けて", "調べて"]);
});

test("指示の履歴: コンテキストの消去も会話の順に並べる（指示の一覧・↑↓ の呼び出しには入れない。入力欄に入れる文はない）", () => {
  const events = [event("user", { text: "前の話" }), event("context_cleared", {}), event("user", { text: "新しい話" })];
  const list = promptListOf(events);
  assert.deepEqual(list.entries.map((p) => p.id), [events[0].id, events[2].id]);
  assert.deepEqual(list.history.map((p) => [p.id, p.cleared]), [
    [events[0].id, false],
    [events[1].id, true],
    [events[2].id, false],
  ]);
  const cleared = list.history[1];
  assert.equal(cleared.text, "");
  assert.equal(cleared.label, CONTEXT_CLEARED_LABEL);
  assert.deepEqual(list.recalls, ["新しい話", "前の話"]);
});
