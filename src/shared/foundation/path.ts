// 「/」区切りの相対パスと木の補助（純粋な関数。コアのフォルダの中のファイル・画面のエディタとノートの木・スマホが同じものを使う）

/** ホームフォルダを指す印（画面はホームの実際の場所を知らないので、これを渡してコア・メインプロセスが expandHomeWith で展開する） */
export const HOME_FOLDER = "~";

/** "~" と "~/..." をホームフォルダ home に展開する（それ以外はそのまま。コアは expandHome が OS のホームを渡す） */
export function expandHomeWith(p: string, home: string): string {
  if (p === "~") return home;
  return p.startsWith("~/") ? `${home.replace(/\/+$/, "")}${p.slice(1)}` : p;
}

/** 親フォルダ（いちばん上の段なら null） */
export function parentPath(rel: string): string | null {
  const i = rel.lastIndexOf("/");
  return i < 0 ? null : rel.slice(0, i);
}

/** 名前（最後の部分） */
export function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

/** フォルダとその中の名前をつなぐ（dir が null・"" ならいちばん上の段） */
export function joinPath(dir: string | null, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** rel が dir の中か（dir 自身も含む。"" はすべて） */
export function isUnder(rel: string, dir: string): boolean {
  return dir === "" || rel === dir || rel.startsWith(`${dir}/`);
}

/** rel を見せるために開くフォルダ（親をたどったもの。上から順。いちばん上の段なら空） */
export function ancestorsOf(rel: string): string[] {
  const out: string[] = [];
  for (let p = parentPath(rel); p; p = parentPath(p)) out.unshift(p);
  return out;
}

/** from を to へ動かしたあとの rel（from そのもの・from のフォルダの中なら付け替える。関係なければそのまま） */
export function remapPrefix(rel: string, from: string, to: string): string {
  if (rel === from) return to;
  return rel.startsWith(`${from}/`) ? `${to}${rel.slice(from.length)}` : rel;
}

/** いくつかのパスのうち、ほかのフォルダの中に入っていないものだけ（フォルダと中身を重ねて扱わない。並びは元のまま） */
export function topLevelPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => !paths.some((q) => q !== p && p.startsWith(`${q}/`)));
}

export interface PathTreeNode {
  path: string;
  name: string;
  dir: boolean;
  children: PathTreeNode[];
}

/** フォルダを先に、名前の順（大文字・小文字を区別しない。数は数として比べる）。中の段も並べ、同じ配列を返す */
export function sortTreeNodes(nodes: PathTreeNode[]): PathTreeNode[] {
  nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  for (const node of nodes) sortTreeNodes(node.children);
  return nodes;
}

/** パスの一覧から木を作る（途中のフォルダも出す。並べたいちばん上の段を返す） */
export function buildPathTree(entries: readonly { path: string; dir: boolean }[]): PathTreeNode[] {
  const root: PathTreeNode = { path: "", name: "", dir: true, children: [] };
  const folders = new Map<string, PathTreeNode>([["", root]]);
  const folderOf = (dir: string): PathTreeNode => {
    const found = folders.get(dir);
    if (found) return found;
    const node: PathTreeNode = { path: dir, name: baseName(dir), dir: true, children: [] };
    folders.set(dir, node);
    folderOf(parentPath(dir) ?? "").children.push(node);
    return node;
  };
  for (const entry of entries) {
    if (entry.dir) folderOf(entry.path);
    else folderOf(parentPath(entry.path) ?? "").children.push({ path: entry.path, name: baseName(entry.path), dir: false, children: [] });
  }
  return sortTreeNodes(root.children);
}
