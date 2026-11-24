import assert from "node:assert/strict";
import { test } from "vitest";
import type { CaptureAttachment, NoteAttachment } from "@shared/chat/types";
import { attachmentCardOf, captureSubline, captureTitle, fileKindLabel, noteSubline } from "./attachmentCards";

const capture: CaptureAttachment = {
  kind: "capture",
  id: "x",
  name: "issue-12.md",
  mime: "text/markdown",
  size: 10,
  source: { type: "github_issue", label: "o/r#12 落ちる", url: null },
  taken_at: "2026-11-13T01:30:00.000Z",
  truncated: false,
  original_size: 10,
  redacted: 0,
};
const note: NoteAttachment = { kind: "note", id: "n", name: "c.md", mime: "text/markdown", size: 5, note: "開発履歴/c.md", taken_at: "2026-11-14T04:48:00Z" };
const clock = () => "01:30";

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

test("captureSubline: 出どころと取った時刻、伏せた数・切った印", () => {
  assert.equal(captureSubline(capture, clock), "GitHub の issue · 01:30 に取得");
  assert.equal(captureSubline({ ...capture, redacted: 2, truncated: true }, clock), "GitHub の issue · 01:30 に取得 · 鍵 2 か所を伏せた · 頭と終わりだけ");
});

test("captureTitle: 外から来たか・伏せた数・切ったことを書く", () => {
  assert.match(captureTitle(capture, clock), /外から来たデータです/);
  assert.ok(!captureTitle(capture, clock).includes("伏せました"));
  const db = { ...capture, source: { type: "db_failure" as const, label: "本番", url: null }, redacted: 2, truncated: true, original_size: 45 * 1024 * 1024 };
  const title = captureTitle(db, clock);
  assert.ok(!title.includes("外から来た"));
  assert.match(title, /鍵らしい値を 2 か所伏せました/);
  assert.match(title, /元は 45\.0 MB/);
});

test("attachmentCardOf: 3 種類の札の文と、外から来たか", () => {
  // ファイル: 種類と大きさ（アップロード中はその文）。外ではない
  assert.deepEqual(attachmentCardOf({ name: "report.pdf", mime: "application/pdf", size: 2048 }, { clock }), { name: "report.pdf", sub: "PDF · 2.0 KB", title: "report.pdf", external: false });
  assert.equal(attachmentCardOf({ name: "a", mime: "text/plain", size: 1 }, { clock, uploading: true }).sub, "アップロード中…");
  // ノート: 名前は最後の名前、説明にパスと時刻
  const n = attachmentCardOf(note, { clock });
  assert.equal(n.name, "c.md");
  assert.equal(n.sub, "ノート · 開発履歴 · 01:30");
  assert.match(n.title, /^ノート: 開発履歴\/c\.md\n01:30 に付けた/);
  assert.equal(n.external, false);
  // 取ったもの: 出どころの名前。issue は外、DB の様子は外ではない
  assert.equal(attachmentCardOf(capture, { clock }).name, "o/r#12 落ちる");
  assert.equal(attachmentCardOf(capture, { clock }).external, true);
  assert.equal(attachmentCardOf({ ...capture, source: { type: "db_failure" as const, label: "本番", url: null } }, { clock }).external, false);
});
