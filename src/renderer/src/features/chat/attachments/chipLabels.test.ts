import assert from "node:assert/strict";
import { test } from "node:test";
import { fileKindLabel, memoSubline } from "./chipLabels";

test("fileKindLabel: 拡張子を大文字に。拡張子がない・隠しファイルの頭の点だけなら null", () => {
  assert.equal(fileKindLabel("report.pdf"), "PDF");
  assert.equal(fileKindLabel("a.test.ts"), "TS");
  assert.equal(fileKindLabel("Makefile"), null);
  assert.equal(fileKindLabel(".env"), null);
  assert.equal(fileKindLabel("x."), null);
});

test("memoSubline: メモ・入ったフォルダ・付けた時刻を「 · 」でつなぐ（ないものは省く）", () => {
  const clock = () => "今日 13:48";
  assert.equal(memoSubline("開発履歴/01_機能一覧.html", "2026-11-14T04:48:00Z", clock), "メモ · 開発履歴 · 今日 13:48");
  assert.equal(memoSubline("a/b/c.md", null, clock), "メモ · a/b");
  assert.equal(memoSubline("c.md", undefined, clock), "メモ");
});
