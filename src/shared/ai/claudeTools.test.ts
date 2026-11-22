import assert from "node:assert/strict";
import { test } from "vitest";
import { claudeToolOf, editHunksOf, toolUse } from "@shared/ai/claudeTools";

test("ツールの表: パスの欄・書き換えるか・探す場所か。表にないツールは null", () => {
  assert.deepEqual(claudeToolOf("Edit"), { pathKey: "file_path", writes: true, searches: false });
  assert.equal(claudeToolOf("Grep")?.searches, true);
  assert.equal(claudeToolOf("mcp__kickoff_chat__read_chat"), null);
});

test("呼び出しを作る: Claude Code の名前と入力の形。分からない欄（Write の中身・Edit の文・Grep の場所）は入れない", () => {
  assert.deepEqual(toolUse.bash("ls"), { name: "Bash", input: { command: "ls" } });
  assert.deepEqual(toolUse.write("/a"), { name: "Write", input: { file_path: "/a" } });
  assert.deepEqual(toolUse.write("/a", "x"), { name: "Write", input: { file_path: "/a", content: "x" } });
  assert.deepEqual(toolUse.edit("/a"), { name: "Edit", input: { file_path: "/a" } });
  assert.deepEqual(toolUse.edit("/a", { old_string: "o", new_string: "n" }), { name: "Edit", input: { file_path: "/a", old_string: "o", new_string: "n" } });
  assert.deepEqual(toolUse.multiEdit("/a", [], { deleted: true }), { name: "MultiEdit", input: { file_path: "/a", edits: [], deleted: true } });
  assert.deepEqual(toolUse.grep("x"), { name: "Grep", input: { pattern: "x" } });
  assert.deepEqual(toolUse.grep("x", "/src"), { name: "Grep", input: { pattern: "x", path: "/src" } });
  assert.deepEqual([toolUse.read("/a"), toolUse.webSearch("q"), toolUse.webFetch("u")].map((c) => c.name), ["Read", "WebSearch", "WebFetch"]);
});

test("editHunksOf: Claude の Edit・Write、ほかの AI の MultiEdit の edits・消した・名前を変えた、Copilot の diff を 1 つの形で読む", () => {
  assert.deepEqual(editHunksOf("Edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y" }), { path: "/r/a.ts", hunks: [{ old_string: "x", new_string: "y" }], deleted: false, movedTo: null });
  assert.deepEqual(editHunksOf("Write", { file_path: "/r/n.md", content: "1\n2" })?.hunks, [{ old_string: "", new_string: "1\n2" }]);
  // Codex の変更（塊ごとの edits）と名前の変更
  const codex = editHunksOf("MultiEdit", { file_path: "/r/b.ts", edits: [{ old_string: "a", new_string: "b" }, { old_string: "", new_string: "c" }], move_path: "/r/c.ts" });
  assert.deepEqual(codex, { path: "/r/b.ts", hunks: [{ old_string: "a", new_string: "b" }, { old_string: "", new_string: "c" }], deleted: false, movedTo: "/r/c.ts" });
  assert.equal(editHunksOf("MultiEdit", { file_path: "/r/d.ts", edits: [{ old_string: "x", new_string: "" }], deleted: true })?.deleted, true);
  // Copilot の承認の diff（前後の変えていない行は入れない）
  const diff = ["--- a/r/e.ts", "+++ b/r/e.ts", "@@ -1,3 +1,3 @@", " keep", "-old", "+new", "@@ -9 +9 @@", "+added"].join("\n");
  assert.deepEqual(editHunksOf("Edit", { file_path: "/r/e.ts", diff })?.hunks, [{ old_string: "old", new_string: "new" }, { old_string: "", new_string: "added" }]);
  // ファイルを変えるツールでない・パスがない
  assert.equal(editHunksOf("Read", { file_path: "/r/a.ts" }), null);
  assert.equal(editHunksOf("Edit", {}), null);
});
