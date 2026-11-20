// ノートのタブの木と、パスの補助（純粋な関数。パスはノートのフォルダからの相対で、区切りは /）
import { noteExtensionOf, noteKindOf, type NoteKind } from "@shared/notes/kinds";
import { uniqueNoteName } from "@shared/notes/names";
import type { NoteEntry } from "@shared/notes/types";
import type { TreeNode } from "@/foundation/ui/kit/list/treeModel";

/** フォルダを先に、名前の順（大文字・小文字を区別しない。数は数として比べる。エディタの木と同じ） */
function sortNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  for (const node of nodes) sortNodes(node.children);
}

/** ノートの一覧から木を作る（中身のないフォルダも出す。いちばん上の段を返す） */
export function buildNoteTree(entries: readonly NoteEntry[]): TreeNode[] {
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

/**
 * ノートのファイル（.md・.html など）だけの木（入力欄の上の「ノート」の一覧）。フォルダはノートのタブと同じ並びで、
 * ノートの入っていないフォルダ（空・画像だけなど）は出さない
 */
export function buildNoteFileTree(entries: readonly NoteEntry[]): TreeNode[] {
  return buildNoteTree(entries.filter((e) => !e.dir && noteExtensionOf(e.path) !== null));
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
export function joinNotePath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

/** ノートの題名（ファイル名からノートの拡張子 .md・.html などを除いたもの。ほかのファイルは名前のまま） */
export function noteTitle(path: string): string {
  const name = baseName(path);
  const ext = noteExtensionOf(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * path と同じ名前のノート・フォルダが、同じフォルダにもうあるか（作る・名前を変える前の確かめ。ファイル名は拡張子まで比べるので、
 * 拡張子が違えば同じ題名でも別の名前。大文字・小文字の違いは同じ名前とみなす（macOS のファイル名）。except は名前を変える元（大文字・小文字だけ変えるのは許す））
 */
export function pathTaken(entries: readonly NoteEntry[], path: string, except?: string): boolean {
  const target = path.toLowerCase();
  return entries.some((e) => e.path !== except && e.path.toLowerCase() === target);
}

/**
 * 新しく作るノート・フォルダのパス（Finder の「新規フォルダ」と同じく、先に仮の名前で作ってから名前を変えてもらう）。
 * folder の中で、base ＋ ext と重ならない名前（base・base-2 …。大文字・小文字は同じとみなす）
 */
export function untitledPath(entries: readonly NoteEntry[], folder: string, base: string, ext = ""): string {
  const suffix = ext.toLowerCase();
  const taken = entries
    .filter((e) => parentOf(e.path) === folder)
    .map((e) => baseName(e.path))
    .filter((name) => name.toLowerCase().endsWith(suffix))
    .map((name) => name.slice(0, name.length - suffix.length));
  return joinNotePath(folder, `${uniqueNoteName(base, taken)}${ext}`);
}

/** 名前を変えたあとのパス（ノートは元の拡張子 .md・.html などを付け直す。ほかのファイルは書いた名前のまま） */
export function renamedPath(path: string, dir: boolean, name: string): string {
  const ext = dir ? null : noteExtensionOf(path);
  const keepAsTyped = !dir && !ext && baseName(path).includes(".");
  return joinNotePath(parentOf(path), dir || keepAsTyped ? name : `${name}${ext ?? ".md"}`);
}

/**
 * from を to へ動かしたあとの path（from そのもの・from のフォルダの中なら付け替える。関係なければそのまま）。
 * 開いているノート・開いているフォルダを、名前の変更・移動に付いていかせる
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
export function filterNotes(entries: readonly NoteEntry[], query: string): NoteEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => !e.dir && baseName(e.path).toLowerCase().includes(q)).sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

/**
 * 最近変えたノート（ノートの拡張子 .md・.html などのファイルだけ。kind を渡せばその種類だけ。新しく変えた順に limit 件。
 * 「既存のノートに追記」（Markdown だけ）・入力欄の上のノートの一覧）
 */
export function recentNotes(entries: readonly NoteEntry[], limit: number, kind?: NoteKind): NoteEntry[] {
  return entries
    .filter((e) => !e.dir && noteExtensionOf(e.path) !== null && (kind === undefined || noteKindOf(e.path) === kind))
    .sort((a, b) => b.modified_at.localeCompare(a.modified_at))
    .slice(0, limit);
}
