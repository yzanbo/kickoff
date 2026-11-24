import assert from "node:assert/strict";
import { createElement, type ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import type { TreeNode } from "./tree";
import { TreeView } from "./TreeView";
import { useTree } from "./useTree";

const roots: TreeNode<string>[] = [{ key: "docs", children: [{ key: "docs/a.md" }] }, { key: "b.md" }];

type ViewProps = Omit<ComponentProps<typeof TreeView<string, TreeNode<string>>>, "tree" | "renderRow">;

/** 最初の描画（effect は流れない）: 開いたフォルダの中だけを treeitem で描き、段と開閉を aria で出す */
function render(open: string[], props: ViewProps = {}, selected?: string): string {
  const Probe = () => {
    const tree = useTree<string, TreeNode<string>>({
      roots,
      open: { isOpen: (k) => open.includes(k), set: () => {} },
      selection: selected === undefined ? undefined : { has: (k) => k === selected },
      onActivate: () => {},
      label: "ファイル",
    });
    return createElement(TreeView<string, TreeNode<string>>, { tree, renderRow: (row, { nameField }) => nameField ?? row.key, ...props });
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

// ノートの木（分冊 09 で乗せる）の違いを、土台の口で受けられること: 行のドラッグ・ダブルクリック（行の属性）・拡張子を添えた名前の欄
test("TreeView: 行の属性とクラスを足し、名前を変えている行は名前の欄（拡張子の添え）を描く", () => {
  const html = render(["docs"], {
    rowProps: (row) => ({ className: row.key === "b.md" ? "note-row" : undefined, draggable: true, onDoubleClick: () => {}, "data-kind": "M" }),
    renaming: { key: "b.md", initial: "b", suffix: ".md", placeholder: "名前", submit: () => {}, cancel: () => {} },
  });
  assert.match(html, /draggable="true" data-kind="M" class="list-item tree-row tree-indent note-row renaming"/);
  assert.match(html, /<input [^>]*placeholder="名前" maxLength="255" value="b"\/><span class="inline-name-suffix">\.md<\/span>/);
});

test("TreeView: 木のドラッグは行をつかめるようにし、sticky は中身の見える開いたフォルダの行に下の限りを付ける", () => {
  assert.equal(render([], { drag: { dragType: "x", onDropInto: () => {} } }).match(/draggable="true"/g)?.length, 2);
  const html = render(["docs"], { sticky: true }, "docs/a.md");
  assert.match(html, /class="tree-view" data-sticky="true"/);
  assert.match(html, /data-sticky="true" style="--depth:0;--row-index:0;--row-last:1"/);
  // 選んだ行の段の線を濃くする印
  assert.match(html, /data-guide="true" style="--depth:1;--guide-sel:0"/);
});
