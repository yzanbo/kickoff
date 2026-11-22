import assert from "node:assert/strict";
import { test } from "vitest";
import { claudeToolOf, toolUse } from "@shared/ai/claudeTools";

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
