import assert from "node:assert/strict";
import { test } from "vitest";
import type { AttachmentSourceType } from "@shared/types";
import { makeAttachment } from "@shared/foundation/testing/factories";
import { mergeAttachments } from "./attachmentMerge";

const note = (id: string, path: string) => makeAttachment(id, { kind: "note", name: path, mime: "text/markdown", note: path, taken_at: "2026-11-13T00:00:00Z" });
const capture = (id: string, label: string, type: AttachmentSourceType = "github_issue") =>
  makeAttachment(id, { kind: "capture", name: "x.md", mime: "text/markdown", source: { type, label, url: null }, taken_at: "2026-11-13T00:00:00Z", truncated: false, original_size: 1, redacted: 0 });

test("mergeAttachments: 同じブラウザのページから別々に選んだ文はどちらも残す", () => {
  const first = capture("c1", "example.test", "browser_selection");
  const second = capture("c2", "example.test", "browser_selection");
  assert.deepEqual(mergeAttachments([first], [second]), [first, second]);
  assert.deepEqual(mergeAttachments([first], [first]), [first]);
});

test("mergeAttachments: 足したものは後ろに、同じノート・同じ出どころは新しいものに入れ替える", () => {
  const prev = [makeAttachment("a"), note("m1", "a.md"), capture("c1", "#1"), capture("c2", "#2")];
  const merged = mergeAttachments(prev, [note("m2", "a.md"), capture("c3", "#1"), makeAttachment("b")]);
  assert.deepEqual(
    merged.map((a) => a.id),
    ["a", "c2", "m2", "c3", "b"],
  );
});
