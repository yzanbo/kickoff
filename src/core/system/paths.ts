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
