import { test } from "vitest";
import assert from "node:assert/strict";
import { SIDE_VIEWS, sideViewOfTab } from "./sideView";

test("プロジェクトのタブを右サイドバーの中身にする（ボード・チャットは出さない）", () => {
  assert.equal(sideViewOfTab("ci"), "ci");
  assert.equal(sideViewOfTab("notes"), "notes");
  assert.equal(sideViewOfTab("board"), null);
  assert.equal(sideViewOfTab("chats"), null);
  assert.equal(sideViewOfTab("browser"), null);
});

test("ブラウザが先頭で、ボード・チャット以外のプロジェクトのタブがすべてある", () => {
  assert.equal(SIDE_VIEWS[0], "browser");
  for (const tab of ["files", "search", "changes", "history", "notes", "db", "github", "docker", "ci", "trash"]) assert.ok((SIDE_VIEWS as readonly string[]).includes(tab), tab);
});
