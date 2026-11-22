import assert from "node:assert/strict";
import { test } from "vitest";
import { storage } from "./storage";

test("宣言: チャットごとの書きかけと添付は ID を含む（DB を作り直したら捨てる）", () => {
  assert.equal(storage.settings.draft(1).ids, true);
  assert.equal(storage.settings.attachments(1).ids, true);
});

test("送る前の添付: 形の合う添付だけを読み、空なら保存しない", () => {
  const setting = storage.settings.attachments(1);
  const ok = { kind: "file" as const, id: "a", name: "x.png", mime: "image/png", size: 3 };
  const note = { kind: "note", id: "b", name: "m.md", mime: "text/markdown", size: 4, note: "m.md", taken_at: "2026-11-13T00:00:00Z" };
  const capture = { kind: "capture", id: "c", name: "i.md", mime: "text/markdown", size: 1, source: { type: "github_issue", label: "#1", url: null }, taken_at: "2026-11-13T00:00:00Z", truncated: false, original_size: 1, redacted: 0 };
  const broken = { kind: "capture", id: "d", name: "i.md", mime: "text/markdown", size: 1 };
  const noKind = { id: "e", name: "n.md", mime: "text/markdown", size: 0, note: "n.md" };
  assert.deepEqual(setting.decode(JSON.stringify([ok, { id: 1 }, null, note, capture, broken, noKind])), [ok, note, capture]);
  assert.equal(setting.decode("{}"), undefined);
  assert.equal(setting.encode([]), null);
  assert.equal(setting.encode([ok]), JSON.stringify([ok]));
});
