import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import type { TreeNode } from "./tree";
import { TreeView } from "./TreeView";
import { useTree } from "./useTree";

const roots: TreeNode<string>[] = [{ key: "docs", children: [{ key: "docs/a.md" }] }, { key: "b.md" }];

/** 最初の描画（effect は流れない）: 開いたフォルダの中だけを treeitem で描き、段と開閉を aria で出す */
function render(open: string[]): string {
  const Probe = () => {
    const tree = useTree<string, TreeNode<string>>({ roots, open: { isOpen: (k) => open.includes(k), set: () => {} }, onActivate: () => {}, label: "ファイル" });
    return createElement(TreeView<string, TreeNode<string>>, { tree, renderRow: (row) => row.key });
  };
  return renderToString(createElement(Probe));
}

test("TreeView: 開いたフォルダの中だけを描き、aria-level・aria-expanded を付ける", () => {
  const closed = render([]);
  assert.match(closed, /role="tree"[^>]*aria-label="ファイル"/);
  assert.equal(closed.match(/role="treeitem"/g)?.length, 2);
  assert.match(closed, /aria-level="1" aria-expanded="false"/);
  const opened = render(["docs"]);
  assert.equal(opened.match(/role="treeitem"/g)?.length, 3);
  assert.match(opened, /aria-level="2"[^>]*>docs\/a\.md/);
});
