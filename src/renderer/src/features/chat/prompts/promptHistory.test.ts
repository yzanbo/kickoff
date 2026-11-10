import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import { CONTEXT_CLEARED_LABEL, historyMove, promptBefore, promptListOf, type HistoryInput } from "./promptHistory";

const event = eventSequence();

test("前の発言: 自分の発言だけを新しい順に。添付だけの発言は除き、続けて同じ文は 1 つにまとめる", () => {
  const events = [
    event("user", { text: "一つ目" }),
    event("text", { text: "AI の返答" }),
    event("user", { text: "  二つ目  " }),
    event("user", { text: "二つ目" }),
    event("user", { text: "", attachments: [{ id: "a", name: "a.png", mime: "image/png", size: 1 }] }),
    event("user", { text: "三つ目" }),
  ];
  assert.deepEqual(promptListOf(events).recalls, ["三つ目", "二つ目", "一つ目"]);
  assert.deepEqual(promptListOf([]).recalls, []);
});

test("指示の一覧: 自分の発言を会話の順に（添付だけならファイル名）。同じ記録の配列なら作り直さない", () => {
  const events = [
    event("user", { text: " 調べて " }),
    event("text", { text: "AI の返答" }),
    event("user", { text: "", attachments: [{ id: "a", name: "a.png", mime: "image/png", size: 1 }] }),
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
  const events = [event("user", { text: "調べて" }), event("user", { text: "メモにまとめて", pre_compact: true }), event("user", { text: "メモを読み直して", post_compact: true })];
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
      attachments: { "どの形にしますか？": [{ id: "a", name: "a.png", mime: "image/png", size: 1 }] },
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

const prompts = ["新しい", "1行目\n2行目", "古い"];
const move = (input: Partial<HistoryInput> & Pick<HistoryInput, "key">) => {
  const text = input.text ?? "";
  const caret = input.selectionStart ?? text.length;
  return historyMove({ prompts, index: -1, text, selectionStart: caret, selectionEnd: input.selectionEnd ?? caret, ...input });
};

test("↑: 入力欄が空なら、いちばん新しい発言から古い方へ呼び出す。いちばん古い発言の先はない", () => {
  assert.deepEqual(move({ key: "ArrowUp" }), { index: 0, text: "新しい", caret: 3 });
  // 複数行の文は、続けて ↑ を押せるよう 1 行目の終わりにキャレットを置く
  assert.deepEqual(move({ key: "ArrowUp", index: 0, text: "新しい" }), { index: 1, text: "1行目\n2行目", caret: 3 });
  assert.deepEqual(move({ key: "ArrowUp", index: 1, text: "1行目\n2行目", selectionStart: 3 }), { index: 2, text: "古い", caret: 2 });
  assert.equal(move({ key: "ArrowUp", index: 2, text: "古い" }), null);
  assert.equal(historyMove({ key: "ArrowUp", prompts: [], index: -1, text: "", selectionStart: 0, selectionEnd: 0 }), null);
});

test("↓: 新しい方へ戻り、いちばん新しい発言を越えたら空の入力欄に戻す。呼び出していなければ何もしない", () => {
  assert.deepEqual(move({ key: "ArrowDown", index: 2, text: "古い" }), { index: 1, text: "1行目\n2行目", caret: 7 });
  assert.deepEqual(move({ key: "ArrowDown", index: 1, text: "1行目\n2行目" }), { index: 0, text: "新しい", caret: 3 });
  assert.deepEqual(move({ key: "ArrowDown", index: 0, text: "新しい" }), { index: -1, text: "", caret: 0 });
  assert.equal(move({ key: "ArrowDown" }), null);
});

test("複数行の文: ↑ は 1 行目、↓ は最後の行にキャレットがあるときだけ履歴に使う（それ以外は普通のカーソル移動）", () => {
  const multi = { index: 1, text: "1行目\n2行目" };
  assert.equal(move({ key: "ArrowUp", ...multi, selectionStart: 5 }), null);
  assert.notEqual(move({ key: "ArrowUp", ...multi, selectionStart: 0 }), null);
  assert.equal(move({ key: "ArrowDown", ...multi, selectionStart: 2 }), null);
  assert.notEqual(move({ key: "ArrowDown", ...multi, selectionStart: 4 }), null);
});

test("書き換えた文・自分で書いた文・範囲を選んでいるときは、履歴に使わない", () => {
  assert.equal(move({ key: "ArrowUp", index: 0, text: "新しい！" }), null);
  assert.equal(move({ key: "ArrowDown", index: 0, text: "新しい！" }), null);
  assert.equal(move({ key: "ArrowUp", text: "書きかけ" }), null);
  assert.equal(move({ key: "ArrowUp", index: 0, text: "新しい", selectionStart: 0, selectionEnd: 3 }), null);
  // 書き換えたあと全部消して空にすれば、いちばん新しい発言からやり直す
  assert.deepEqual(move({ key: "ArrowUp", index: 2, text: "" }), { index: 0, text: "新しい", caret: 3 });
});
