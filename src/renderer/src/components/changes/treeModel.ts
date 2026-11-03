import type { GitChangeKind, GitFileChange, GitStatus, ProjectFiles } from "../../../../core/types";

/** エクスプローラーの 1 行（フォルダかファイル） */
export interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  /** .gitignore で無視しているもの（薄く出し、フォルダは中を開かない） */
  ignored: boolean;
  children: TreeNode[];
}

/** フォルダを先に、名前の順（大文字・小文字を区別しない。VS Code と同じ） */
function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  for (const node of nodes) sortNodes(node.children);
}

/** ファイルのパスの一覧から、フォルダの木を作る（いちばん上の段を返す） */
export function buildTree({ files, ignored }: Pick<ProjectFiles, "files" | "ignored">): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, ignored: false, children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);
  const folderOf = (dirPath: string): TreeNode => {
    const found = folders.get(dirPath);
    if (found) return found;
    const slash = dirPath.lastIndexOf("/");
    const node: TreeNode = { name: dirPath.slice(slash + 1), path: dirPath, dir: true, ignored: false, children: [] };
    folderOf(slash < 0 ? "" : dirPath.slice(0, slash)).children.push(node);
    folders.set(dirPath, node);
    return node;
  };
  const add = (filePath: string, dir: boolean, isIgnored: boolean) => {
    const slash = filePath.lastIndexOf("/");
    const parent = folderOf(slash < 0 ? "" : filePath.slice(0, slash));
    const node: TreeNode = { name: filePath.slice(slash + 1), path: filePath, dir, ignored: isIgnored, children: [] };
    parent.children.push(node);
    if (dir) folders.set(filePath, node);
  };
  for (const file of files) add(file, false, false);
  for (const entry of ignored) if (!folders.has(entry.path)) add(entry.path, entry.dir, true);
  sortNodes(root.children);
  return root.children;
}

/** 目立たせる順（競合がいちばん。フォルダには、中でいちばん目立つものの色を付ける） */
const PRIORITY: GitChangeKind[] = ["!", "M", "T", "D", "R", "C", "A", "U"];

/**
 * ファイルとフォルダの変更の記号。ファイルは、まだステージしていない変更・競合を、ステージ済みより優先する。
 * フォルダは、中にあるファイル（消したファイルも含む）でいちばん目立つもの
 */
export function changeKinds(status: GitStatus | undefined): ChangeKinds {
  return kindMaps(status?.repo ? [...status.staged, ...status.unstaged, ...status.conflicts] : []);
}

export type ChangeKinds = { files: Map<string, GitChangeKind>; folders: Map<string, GitChangeKind> };

/** 変更の一覧から、ファイルとフォルダの記号を作る（後ろにあるものほど優先する） */
export function kindMaps(changes: GitFileChange[]): ChangeKinds {
  const files = new Map<string, GitChangeKind>();
  const folders = new Map<string, GitChangeKind>();
  for (const change of changes) files.set(change.path, change.kind);
  const stronger = (a: GitChangeKind | undefined, b: GitChangeKind) => (a !== undefined && PRIORITY.indexOf(a) <= PRIORITY.indexOf(b) ? a : b);
  for (const [file, kind] of files) {
    for (const folder of parentFolders(file)) folders.set(folder, stronger(folders.get(folder), kind));
  }
  return { files, folders };
}

/** ファイルの上にあるフォルダのパス（近い順。"a/b/c.ts" → ["a/b", "a"]） */
export function parentFolders(file: string): string[] {
  const out: string[] = [];
  for (let slash = file.lastIndexOf("/"); slash > 0; slash = file.lastIndexOf("/", slash - 1)) out.push(file.slice(0, slash));
  return out;
}

/** 木の中のフォルダのパス（すべて） */
export function folderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (!node.dir) continue;
    out.push(node.path);
    folderPaths(node.children, out);
  }
  return out;
}
