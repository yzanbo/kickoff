import assert from "node:assert/strict";
import { test } from "vitest";
import { fileKindLabel, noteSubline } from "./chipLabels";

test("fileKindLabel: 拡張子を大文字に。拡張子がない・隠しファイルの頭の点だけなら null", () => {
  assert.equal(fileKindLabel("report.pdf"), "PDF");
  assert.equal(fileKindLabel("a.test.ts"), "TS");
  assert.equal(fileKindLabel("Makefile"), null);
  assert.equal(fileKindLabel(".env"), null);
  assert.equal(fileKindLabel("x."), null);
});

test("noteSubline: ノート・入ったフォルダ・付けた時刻を「 · 」でつなぐ（フォルダがなければ省く）", () => {
  const clock = () => "今日 13:48";
  assert.equal(noteSubline("開発履歴/01_機能一覧.html", "2026-11-14T04:48:00Z", clock), "ノート · 開発履歴 · 今日 13:48");
  assert.equal(noteSubline("a/b/c.md", "2026-11-14T04:48:00Z", clock), "ノート · a/b · 今日 13:48");
  assert.equal(noteSubline("c.md", "2026-11-14T04:48:00Z", clock), "ノート · 今日 13:48");
});
