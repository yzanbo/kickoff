import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { swapContributions } from "@/foundation/ui/points";
import { toolRowViewOf, toolRowViews, type ToolRowView } from "./toolRowViews";

/** 登録を入れ替えて、終わったら戻す */
function install(views: ToolRowView[]) {
  onTestFinished(swapContributions(views.map((v) => toolRowViews.item(v))));
}

test("toolRowViewOf: 中で持つ見せ方を種類と入力の形で引く（入力の形が合わなければ見せ方なし）", () => {
  install([]);
  assert.equal(toolRowViewOf("Bash", { command: "ls" })?.result, "never");
  assert.ok(toolRowViewOf("Read", { file_path: "/r/a.ts" })?.Detail);
  assert.ok(toolRowViewOf("Glob", { pattern: "*.ts" })?.Arg);
  assert.ok(toolRowViewOf("MultiEdit", { file_path: "/r/a.ts", edits: [] })?.Detail);
  // ノートブックの編集・入力の欄がないもの・知らないツールは既定の文
  assert.equal(toolRowViewOf("NotebookEdit", { notebook_path: "/r/a.ipynb" }), undefined);
  assert.equal(toolRowViewOf("Bash", {}), undefined);
  assert.equal(toolRowViewOf("Mystery", { command: "ls" }), undefined);
});

test("toolRowViewOf: 中の表が先、登録したものが後（名前でも関数でも引ける）", () => {
  const byName: ToolRowView = { match: "mcp__x__run", result: "also" };
  const byFn: ToolRowView = { match: (name) => name.startsWith("mcp__y__"), result: "also" };
  const shadow: ToolRowView = { match: "Bash", result: "also" };
  install([byName, byFn, shadow]);
  assert.equal(toolRowViewOf("mcp__x__run", {}), byName);
  assert.equal(toolRowViewOf("mcp__y__any", {}), byFn);
  // 中で持つ見せ方に合えば、登録したものより先
  assert.equal(toolRowViewOf("Bash", { command: "ls" })?.result, "never");
  assert.equal(toolRowViewOf("Bash", {}), shadow);
});
