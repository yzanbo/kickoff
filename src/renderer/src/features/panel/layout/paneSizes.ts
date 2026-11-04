import { normalizeSizes, type PaneLayout, type PaneNode } from "./paneTree";

/** 右のパネルの分割の割合（境目のつまみのドラッグ・ダブルクリック。配置の木は paneLayout.ts） */

/** path（根から子の番号をたどる）の分割の割合を変える。sizes の数が合わなければそのまま */
export function setSplitSizes(layout: PaneLayout, path: readonly number[], sizes: readonly number[]): PaneLayout {
  const visit = (node: PaneNode, depth: number): PaneNode => {
    if (node.type === "pane") return node;
    if (depth === path.length) return sizes.length === node.children.length ? { ...node, sizes: normalizeSizes([...sizes]) } : node;
    return { ...node, children: node.children.map((c, i) => (i === path[depth] ? visit(c, depth + 1) : c)) };
  };
  return { ...layout, root: visit(layout.root, 0) };
}

/** path の分割を等分に戻す */
export function equalizeSplit(layout: PaneLayout, path: readonly number[]): PaneLayout {
  let node: PaneNode | undefined = layout.root;
  for (const i of path) node = node?.type === "split" ? node.children[i] : undefined;
  if (node?.type !== "split") return layout;
  return setSplitSizes(layout, path, node.children.map(() => 1));
}
