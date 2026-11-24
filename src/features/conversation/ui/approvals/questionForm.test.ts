import assert from "node:assert/strict";
import { test } from "vitest";
import type { Question } from "@shared/chat/approvalTypes";
import type { Attachment } from "@shared/chat/types";
import { OTHER } from "./questionAnswers";
import { currentOf, EMPTY_QUESTION_FORM, keyPick, reduceQuestionForm, type QuestionForm, type QuestionFormAction, type QuestionFormContext } from "./questionForm";

const q = (question: string, multiSelect = false, previews = false): Question => ({
  question,
  header: "",
  multiSelect,
  options: ["A", "B", "C"].map((label) => ({ label, description: "", ...(previews ? { preview: `図 ${label}` } : {}) })),
});
const run = (ctx: QuestionFormContext, ...actions: QuestionFormAction[]): QuestionForm => actions.reduce((f, a) => reduceQuestionForm(f, a, ctx), EMPTY_QUESTION_FORM);
const stepped: QuestionFormContext = { questions: [q("一"), q("二", true), q("三")], stepped: true };
const all: QuestionFormContext = { ...stepped, stepped: false };
const noMods = { modified: false, inField: false };

test("questionForm: 1 問ずつなら、1 つ選ぶ質問で選択肢を選ぶと次へ。複数選ぶ質問・すべて並べるときは進まない", () => {
  const f = run(stepped, { type: "toggle", index: 0, label: "B" });
  assert.deepEqual(f.entries[0]?.selected, ["B"]);
  assert.equal(f.step, 1);
  const multi = run(stepped, { type: "step", index: 1 }, { type: "toggle", index: 1, label: "A" }, { type: "toggle", index: 1, label: "C" }, { type: "toggle", index: 1, label: "A" });
  assert.deepEqual(multi.entries[1]?.selected, ["C"]);
  assert.equal(multi.step, 1);
  assert.equal(run(all, { type: "toggle", index: 0, label: "B" }).step, 0);
  // 最後の質問では進まない
  assert.equal(currentOf(run(stepped, { type: "step", index: 2 }, { type: "toggle", index: 2, label: "A" }), 3), 2);
});

test("questionForm: その他は選んでも進まず、書いてから（文は位置ごとに残る）", () => {
  const f = run(stepped, { type: "toggle", index: 0, label: OTHER }, { type: "other", index: 0, text: "自由に" });
  assert.equal(f.step, 0);
  assert.deepEqual(f.entries[0]?.selected, [OTHER]);
  assert.equal(f.entries[0]?.other, "自由に");
});

test("questionForm: 添付を置いたら（ドラッグも）その他を選ぶ。1 つ選ぶ質問はほかを外し、複数選ぶ質問は足す", () => {
  const files = { attachments: [{ name: "a.png" } as Attachment], uploading: false };
  const single = run(stepped, { type: "toggle", index: 0, label: "A" }, { type: "step", index: 0 }, { type: "files", index: 0, files });
  assert.deepEqual(single.entries[0]?.selected, [OTHER]);
  const multi = run(stepped, { type: "toggle", index: 1, label: "A" }, { type: "files", index: 1, files });
  assert.deepEqual(multi.entries[1]?.selected, ["A", OTHER]);
  // 空にしたら選択はそのまま（添付だけ消える）
  const cleared = reduceQuestionForm(multi, { type: "files", index: 1, files: { attachments: [], uploading: false } }, stepped);
  assert.deepEqual(cleared.entries[1]?.selected, ["A", OTHER]);
  assert.deepEqual(cleared.entries[1]?.files?.attachments, []);
});

test("questionForm: たたんでも書いた文と添付と選択を残す。図を見ている選択肢は質問ごと", () => {
  const files = { attachments: [{ name: "a.png" } as Attachment], uploading: false };
  const f = run(all, { type: "other", index: 2, text: "メモ" }, { type: "files", index: 2, files }, { type: "peek", index: 0, label: "B" }, { type: "fold", folded: true }, { type: "fold", folded: false });
  assert.equal(f.entries[2]?.other, "メモ");
  assert.equal(f.entries[2]?.files, files);
  assert.equal(f.entries[0]?.peek, "B");
  assert.equal(f.entries[2]?.peek, null);
  // 同じ選択肢を見直しても同じ状態
  assert.equal(reduceQuestionForm(f, { type: "peek", index: 0, label: "B" }, all), f);
});

test("questionForm: キーの 1〜9 は 1 問ずつ・質問が 1 つのときだけ、いまの質問の選択肢を選ぶ（修飾キー・書く欄・選択肢の外は選ばない）", () => {
  const at1 = run(stepped, { type: "step", index: 1 });
  assert.deepEqual(keyPick("2", at1, stepped, noMods), { type: "toggle", index: 1, label: "B" });
  assert.equal(keyPick("4", at1, stepped, noMods), null);
  assert.equal(keyPick("a", at1, stepped, noMods), null);
  assert.equal(keyPick("1", at1, stepped, { modified: true, inField: false }), null);
  assert.equal(keyPick("1", at1, stepped, { modified: false, inField: true }), null);
  assert.equal(keyPick("1", EMPTY_QUESTION_FORM, all, noMods), null);
  const one: QuestionFormContext = { questions: [q("一", false, true)], stepped: false };
  assert.deepEqual(keyPick("3", EMPTY_QUESTION_FORM, one, noMods), { type: "toggle", index: 0, label: "C" });
});
