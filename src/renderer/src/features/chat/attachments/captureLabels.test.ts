import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaptureAttachment } from "@shared/types";
import { captureSubline, captureTitle } from "./captureLabels";

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
const clock = () => "01:30";

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
