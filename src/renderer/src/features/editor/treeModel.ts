import type { GitChangeKind, GitFileChange, GitStatus, ProjectFiles } from "@shared/types";

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

/** ファイルのパスの一覧から、フォルダの木を作る（いちばん上の段を返す。空のフォルダ empty_dirs も中のないフォルダとして出す） */
export function buildTree({ files, ignored, empty_dirs = [] }: Pick<ProjectFiles, "files" | "ignored"> & Partial<Pick<ProjectFiles, "empty_dirs">>): TreeNode[] {
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
  for (const dir of empty_dirs) folderOf(dir);
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

/** 入ったフォルダのパス（いちばん外側なら空。"a/b/c.ts" → "a/b"） */
export const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

/** フォルダのパスと名前をつなぐ（いちばん外側（空）ならそのまま名前） */
export const joinTreePath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/**
 * 新しいファイル・フォルダの名前を使えないときの理由（使えるなら null）。「a/b.ts」のように「/」で途中のフォルダも書ける（VS Code と同じ）。
 * 空の段・「.」「..」・「\」は使えず、同じフォルダ（siblings）に同じ名前（最初の段が同じファイル、または「/」のない名前が同じもの）があれば断る
 */
export function newEntryNameError(siblings: readonly { name: string; dir: boolean }[], name: string): string | null {
  const parts = name.split("/");
  if (parts.some((p) => !p.trim() || p === "." || p === "..")) return "その名前は使えません";
  if (name.includes("\\")) return "「\\」は名前に使えません";
  const head = parts[0];
  const clash = siblings.find((n) => n.name === head && (parts.length === 1 || !n.dir));
  return clash ? `「${head}」はもうあります` : null;
}
