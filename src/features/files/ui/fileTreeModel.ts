// エクスプローラーのフォルダの木（FileTree.tsx）の決め方のうち、部品を読まない純粋なもの（描く行の木・行の見た目の属性）
import type { TreeNode as RowNode } from "@/foundation/ui/kit/list/tree";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";
import type { ChangeMarks } from "./filesGit";
import type { FileCreate } from "./useFileOps";

/** 新しいファイル・フォルダの名前の欄の行のキー（パスと重ならない） */
export const CREATE_KEY = "\0create";

/** 木の 1 行（file が null なら新しい名前の欄。無視しているフォルダは children を持たない = 開かない） */
export interface FileRow extends RowNode<string> {
  file: TreeNode | null;
  children?: FileRow[];
}

/** 描く木と、パスから同じ段の並びを引く表（名前の確かめに使う） */
export function fileRows(nodes: TreeNode[], creating: FileCreate["creating"] | undefined) {
  const siblings = new Map<string, TreeNode[]>();
  const walk = (level: TreeNode[], parent: string): FileRow[] => {
    siblings.set(parent, level);
    const rows = level.map((node): FileRow => ({ key: node.path, file: node, children: node.dir && !node.ignored ? walk(node.children, node.path) : undefined }));
    return creating?.parent === parent ? [{ key: CREATE_KEY, file: null }, ...rows] : rows;
  };
  const roots = walk(nodes, "");
  const childrenOf = (parent: string) => siblings.get(parent) ?? [];
  const levelOf = (path: string) => childrenOf(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  return { roots, childrenOf, levelOf, nodeOf: (path: string) => levelOf(path).find((n) => n.path === path) };
}

/** 行の見た目の属性（無視しているフォルダは薄く・変更の記号の種類・乗せたときのパスと変更の名前） */
export function fileRowLook(node: TreeNode, mark: ReturnType<ChangeMarks["files"]["get"]>) {
  return {
    className: node.ignored ? "ignored" : undefined,
    "data-kind": mark?.kind,
    title: mark ? `${node.path}（${mark.label}）` : node.path,
  };
}
