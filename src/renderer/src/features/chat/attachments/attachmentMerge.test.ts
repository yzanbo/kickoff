import assert from "node:assert/strict";
import { test } from "vitest";
import type { Attachment, AttachmentSourceType } from "@shared/types";
import { mergeAttachments } from "./attachmentMerge";

const file = (id: string): Attachment => ({ kind: "file", id, name: `${id}.png`, mime: "image/png", size: 1 });
const memo = (id: string, path: string): Attachment => ({ kind: "memo", id, name: path, mime: "text/markdown", size: 1, memo: path, taken_at: "2026-11-13T00:00:00Z" });
const capture = (id: string, label: string, type: AttachmentSourceType = "github_issue"): Attachment => ({
  kind: "capture",
  id,
  name: "x.md",
  mime: "text/markdown",
  size: 1,
  source: { type, label, url: null },
  taken_at: "2026-11-13T00:00:00Z",
  truncated: false,
  original_size: 1,
  redacted: 0,
});

test("mergeAttachments: 同じブラウザのページから別々に選んだ文はどちらも残す", () => {
  const first = capture("c1", "example.test", "browser_selection");
  const second = capture("c2", "example.test", "browser_selection");
  assert.deepEqual(mergeAttachments([first], [second]), [first, second]);
  assert.deepEqual(mergeAttachments([first], [first]), [first]);
});

test("mergeAttachments: 足したものは後ろに、同じメモ・同じ出どころは新しいものに入れ替える", () => {
  const prev = [file("a"), memo("m1", "a.md"), capture("c1", "#1"), capture("c2", "#2")];
  const merged = mergeAttachments(prev, [memo("m2", "a.md"), capture("c3", "#1"), file("b")]);
  assert.deepEqual(
    merged.map((a) => a.id),
    ["a", "c2", "m2", "c3", "b"],
  );
});
