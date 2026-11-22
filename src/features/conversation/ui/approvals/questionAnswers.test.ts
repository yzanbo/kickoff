import assert from "node:assert/strict";
import { test } from "vitest";
import type { Question } from "@shared/chat/approvalTypes";
import type { Attachment } from "@shared/chat/types";
import { buildAnswers, OTHER, shownPreview, type QuestionPick } from "./questionAnswers";

const q = (question: string, multiSelect = false): Question => ({ question, header: "", multiSelect, options: [{ label: "A", description: "" }, { label: "B", description: "" }] });
const pick = (selected: string[], other = "", files: QuestionPick["files"] = null): QuestionPick => ({ selected, other, files });
const file = { name: "a.png" } as Attachment;

test("buildAnswers: 1 つ選ぶ質問は文、複数選ぶ質問は配列。すべて答えたら complete", () => {
  const built = buildAnswers([q("一"), q("二", true)], [pick(["B"]), pick(["A", "B"])]);
  assert.deepEqual(built.answers, { 一: "B", 二: ["A", "B"] });
  assert.deepEqual(built.answered, [true, true]);
  assert.equal(built.complete, true);
});

test("buildAnswers: 答えていない質問があれば不完全。その他は書いた文（空白だけなら答えていない）", () => {
  const built = buildAnswers([q("一"), q("二")], [pick([OTHER], "  自由な答え ")]);
  assert.deepEqual(built.answers, { 一: "自由な答え" });
  assert.deepEqual(built.answered, [true, false]);
  assert.equal(built.complete, false);
  assert.deepEqual(buildAnswers([q("一")], [pick([OTHER], "   ")]).answered, [false]);
});

test("buildAnswers: その他に添付だけなら「添付のとおりです」。その他を選んでいなければ添付は入れない", () => {
  const built = buildAnswers([q("一")], [pick([OTHER], "", { attachments: [file], uploading: false })]);
  assert.deepEqual(built.answers, { 一: "添付のとおりです" });
  assert.deepEqual(built.attachments, { 一: [file] });
  const notPicked = buildAnswers([q("一")], [pick(["A"], "", { attachments: [file], uploading: false })]);
  assert.deepEqual(notPicked.attachments, {});
  assert.deepEqual(notPicked.answers, { 一: "A" });
});

test("buildAnswers: その他の添付をアップロードしている途中は不完全", () => {
  const built = buildAnswers([q("一")], [pick([OTHER], "文", { attachments: [], uploading: true })]);
  assert.equal(built.uploading, true);
  assert.equal(built.complete, false);
  // その他を選んでいなければ、途中でも数えない
  assert.equal(buildAnswers([q("一")], [pick(["A"], "", { attachments: [], uploading: true })]).complete, true);
});

test("shownPreview: 図は乗せた選択肢 → 選んだ選択肢 → 図のある最初の選択肢の順。図のない選択肢に乗せている間は選んだもの・最初のもの", () => {
  const withPreviews: Question = { question: "図", header: "", multiSelect: false, options: [{ label: "A", description: "" }, { label: "B", description: "", preview: "図B" }, { label: "C", description: "", preview: "図C" }] };
  assert.deepEqual(shownPreview(withPreviews, "C", ["B"]), { label: "C", preview: "図C" });
  assert.deepEqual(shownPreview(withPreviews, "A", ["C"]), { label: "C", preview: "図C" });
  assert.deepEqual(shownPreview(withPreviews, null, []), { label: "B", preview: "図B" });
  assert.equal(shownPreview(q("図なし"), null, []), null);
});
