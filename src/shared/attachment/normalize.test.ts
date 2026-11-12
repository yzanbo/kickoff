import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeAttachment } from "./normalize";

const base = { id: "00000000-0000-4000-8000-000000000000", name: "a.md", mime: "text/markdown", size: 3 };

test("normalizeAttachment: 古い形は memo があればメモ、なければファイルに読み替える", () => {
  assert.deepEqual(normalizeAttachment(base), { ...base, kind: "file" });
  assert.deepEqual(normalizeAttachment({ ...base, size: 0, memo: "設計/a.md" }), { ...base, size: 0, kind: "memo", memo: "設計/a.md" });
});

test("normalizeAttachment: 今の形はそのまま", () => {
  const capture = {
    ...base,
    kind: "capture" as const,
    source: { type: "github_issue" as const, label: "#12 落ちる", url: null },
    taken_at: "2026-11-13T00:00:00.000Z",
    truncated: false,
    original_size: 3,
    redacted: 0,
  };
  assert.equal(normalizeAttachment(capture), capture);
});
