import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { historyMove, userPrompts, type HistoryInput } from "./promptHistory.js";

let nextId = 1;
const event = (type: string, data: object): RunEvent => ({ id: nextId++, run_id: 1, type, data, created_at: "2026-11-01T00:00:00Z" }) as unknown as RunEvent;

test("前の発言: 自分の発言だけを新しい順に。添付だけの発言は除き、続けて同じ文は 1 つにまとめる", () => {
  const events = [
    event("user", { text: "一つ目" }),
    event("text", { text: "AI の返答" }),
    event("user", { text: "  二つ目  " }),
    event("user", { text: "二つ目" }),
    event("user", { text: "", attachments: [{ id: "a", name: "a.png", mime: "image/png", size: 1 }] }),
    event("user", { text: "三つ目" }),
  ];
  assert.deepEqual(userPrompts(events), ["三つ目", "二つ目", "一つ目"]);
  assert.deepEqual(userPrompts([]), []);
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
