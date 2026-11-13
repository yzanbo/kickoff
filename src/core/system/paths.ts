import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// パスの判定（リポジトリの中か・~ の展開・リンクの解決）。各所で同じ形を書かない

/** "~" と "~/..." をホームフォルダに展開する（それ以外はそのまま） */
export function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * target が dir の中（dir 自身を含む）か。どちらも絶対パスにそろえてから比べる。
 * "..x" のような名前のフォルダは外と見なさない（".." で始まるかではなく、".." そのものか ".."/ で始まるかで見る）
 */
export function isInside(dir: string, target: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * API・SSE・DB に出す相対パスの形にする（区切りはいつも「/」。OS の区切り sep を置き換える）。
 * 画面・スマホは区切りを OS で読み分けないので、コアが外に出す相対パスはこれを通す（受けたパスは path.join がどちらの区切りも読む）
 */
export function toApiPath(rel: string, sep: string = path.sep): string {
  return sep === "/" ? rel : rel.split(sep).join("/");
}

/** from から to への相対パスを、API の形（区切りは「/」）で */
export const relativeApiPath = (from: string, to: string): string => toApiPath(path.relative(from, to));

/** パスの実体（シンボリックリンクを解いたもの）。見つからなければそのまま */
export function realPathOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/** シンボリックリンクを解決した実体のパス（まだ存在しないファイルは、存在する親から組み立てる） */
export function realPathLoose(p: string): string {
  let current = path.resolve(p);
  const rest: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...rest);
}
