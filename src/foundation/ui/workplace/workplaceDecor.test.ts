import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { onTestFinished, test } from "vitest";
import { makeWorktree } from "@shared/foundation/testing/data";
import { swapContributions } from "@/foundation/ui/points";
import { useWorkplaceNotes, workplaceDecor, workplaceDecorLines } from "./workplaceDecor";

/** 飾りを入れる（テストが終わったら元に戻す） */
function install(...items: Parameters<typeof workplaceDecor.item>[0][]) {
  onTestFinished(swapContributions(items.map((item) => workplaceDecor.item(item))));
}

test("workplaceDecorLines: 飾りの行を登録の順に並べ、一覧を渡す", () => {
  const list = [makeWorktree("/repo-worktrees/a", { branch: "a" })];
  install({ id: "x", lines: (_p, path, l) => [`${path}:${l?.length}`] }, { id: "y" }, { id: "z", lines: () => ["z"] });
  assert.deepEqual(workplaceDecorLines(1, "/repo-worktrees/a", list), ["/repo-worktrees/a:1", "z"]);
});

test("useWorkplaceNotes: 名前に添える文は、文を返した最初の飾りのもの", () => {
  const watch = () => () => {};
  install({ id: "x", note: { text: (path) => (path === "/b" ? "閉じた" : null), watch } }, { id: "y", note: { text: () => "マージ済み", watch } });
  const Probe = () => {
    const noteOf = useWorkplaceNotes();
    return `${noteOf("/a")},${noteOf("/b")}`;
  };
  assert.equal(renderToString(createElement(Probe)), "マージ済み,閉じた");
});
