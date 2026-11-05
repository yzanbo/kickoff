// メモのタブの木と、パスの補助（純粋な関数。パスはメモのフォルダからの相対で、区切りは /）
import { MEMO_EXTENSION, type MemoEntry } from "@shared/types";
import type { TreeNode } from "@/features/editor/treeModel";

/** フォルダを先に、名前の順（大文字・小文字を区別しない。数は数として比べる。エディタの木と同じ） */
function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  for (const node of nodes) sortNodes(node.children);
}

/** メモの一覧から木を作る（中身のないフォルダも出す。いちばん上の段を返す） */
export function buildMemoTree(entries: readonly MemoEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", dir: true, ignored: false, children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);
  const folderOf = (dirPath: string): TreeNode => {
    const found = folders.get(dirPath);
    if (found) return found;
    const node: TreeNode = { name: baseName(dirPath), path: dirPath, dir: true, ignored: false, children: [] };
    folders.set(dirPath, node);
    folderOf(parentOf(dirPath)).children.push(node);
    return node;
  };
  for (const entry of entries) {
    if (entry.dir) folderOf(entry.path);
    else folderOf(parentOf(entry.path)).children.push({ name: baseName(entry.path), path: entry.path, dir: false, ignored: false, children: [] });
  }
  sortNodes(root.children);
  return root.children;
}

/** 親フォルダ（直下なら ""） */
export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** 名前（最後の部分） */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** フォルダとその中の名前をつなぐ（folder が "" なら直下） */
export function joinMemoPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** メモの題名（ファイル名から .md を除いたもの） */
export function memoTitle(path: string): string {
  const name = baseName(path);
  return name.toLowerCase().endsWith(MEMO_EXTENSION) ? name.slice(0, -MEMO_EXTENSION.length) : name;
}

/** 名前を変えたあとのパス（ファイルは元の拡張子を保つ。.md なら付け直す） */
export function renamedPath(path: string, dir: boolean, name: string): string {
  const keepExtension = !dir && !path.toLowerCase().endsWith(MEMO_EXTENSION) && baseName(path).includes(".");
  return joinMemoPath(parentOf(path), dir || keepExtension ? name : `${name}${MEMO_EXTENSION}`);
}

/**
 * from を to へ動かしたあとの path（from そのもの・from のフォルダの中なら付け替える。関係なければそのまま）。
 * 開いているメモ・開いているフォルダを、名前の変更・移動に付いていかせる
 */
export function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
}

/** path が folder の中か（folder 自身も含む。"" はすべて） */
export function isUnder(path: string, folder: string): boolean {
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** path を見せるために開くフォルダ（親をたどったもの。直下なら空） */
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  for (let p = parentOf(path); p; p = parentOf(p)) out.unshift(p);
  return out;
}

/** 名前で絞り込んだファイル（大文字・小文字を区別しない。新しく変えた順） */
export function filterMemos(entries: readonly MemoEntry[], query: string): MemoEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => !e.dir && baseName(e.path).toLowerCase().includes(q)).sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

/** 最近変えたメモ（Markdown のファイルだけ。新しく変えた順に limit 件。「既存のメモに追記」・入力欄の上のメモの一覧） */
export function recentMemos(entries: readonly MemoEntry[], limit: number): MemoEntry[] {
  return entries
    .filter((e) => !e.dir && e.path.endsWith(MEMO_EXTENSION))
    .sort((a, b) => b.modified_at.localeCompare(a.modified_at))
    .slice(0, limit);
}
