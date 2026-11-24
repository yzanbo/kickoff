import assert from "node:assert/strict";
import { test } from "vitest";
import { draftOf, freshAction, startDocument, statusAfterEdit } from "./documentState";

const file = { content: "本文", hash: "h1" };

test("startDocument: 書きかけの戻し方 3 通り（なし・同じ指紋は dirty・違う指紋は conflict）", () => {
  assert.deepEqual(startDocument(file, null), { text: "本文", status: "saved", dropDraft: false });
  assert.deepEqual(startDocument(file, { text: "書きかけ", hash: "h1" }), { text: "書きかけ", status: "dirty", dropDraft: false });
  assert.deepEqual(startDocument(file, { text: "書きかけ", hash: "h0" }), { text: "書きかけ", status: "conflict", dropDraft: false });
  // 書きかけが読み込んだ中身と同じなら、保存済みとして残りを消す
  assert.deepEqual(startDocument(file, { text: "本文", hash: "h0" }), { text: "本文", status: "saved", dropDraft: true });
});

test("statusAfterEdit: 保存したものと同じに戻れば saved、conflict は選ぶまでそのまま", () => {
  assert.equal(statusAfterEdit("saved", "本文２", file), "dirty");
  assert.equal(statusAfterEdit("dirty", "本文", file), "saved");
  assert.equal(statusAfterEdit("conflict", "本文", file), "conflict");
});

test("freshAction: ほかで変わったら、書きかけがなければ読み直し、あれば conflict", () => {
  assert.equal(freshAction(file, "書きかけ", { content: "本文", hash: "h1" }), "none");
  assert.equal(freshAction(file, "本文", { content: "外で", hash: "h2" }), "reload");
  assert.equal(freshAction(file, "書きかけ", { content: "外で", hash: "h2" }), "conflict");
});

test("draftOf: 保存したものと同じなら残さない", () => {
  assert.equal(draftOf("本文", file), null);
  assert.deepEqual(draftOf("書きかけ", file), { text: "書きかけ", hash: "h1" });
});
