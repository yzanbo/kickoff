import assert from "node:assert/strict";
import { test } from "node:test";
import { panelKey, panelScreen, parsePanelKey } from "./surfaces";

test("欄の覚える名前: 欄と画面から作り、読み戻せる（下書きの保存のキーと同じ形）", () => {
  assert.equal(panelKey("board", 3), "kanban:3");
  assert.equal(panelKey("board", "all"), "kanban:all");
  assert.equal(panelKey("side", 3), "side:3");
  assert.equal(panelKey("bottom", "all"), "bottom:all");
  assert.deepEqual(parsePanelKey("bottom:all"), { surface: "bottom", scope: "all" });
  assert.deepEqual(parsePanelKey("side:12"), { surface: "side", scope: 12 });
  for (const bad of ["side", "side:none", "side:0", "panel:3", "kanban:1.5", ""]) assert.equal(parsePanelKey(bad), undefined, bad);
});

test("欄が出る画面: 全プロジェクトの欄（ボード・フッター）は全プロジェクトの画面、プロジェクトの欄はそのプロジェクトのボード", () => {
  assert.deepEqual(panelScreen("kanban:all"), { name: "allProjects" });
  // 以前は kanban 以外の全プロジェクトの欄（フッター）を、ID が NaN のプロジェクトの画面として開いていた
  assert.deepEqual(panelScreen("bottom:all"), { name: "allProjects" });
  assert.deepEqual(panelScreen("bottom:4"), { name: "project", id: 4, tab: "board" });
  assert.deepEqual(panelScreen("side:4"), { name: "project", id: 4, tab: "board" });
  assert.equal(panelScreen("side:none"), undefined);
});
