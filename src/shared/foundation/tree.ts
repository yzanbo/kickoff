// 親子の木をたどる関数（サブエージェントの入れ子・子チャットの家系で共通。純粋）。壊れた記録で親子が輪になっても止まるよう、輪と深さの守りはここだけに書く

/** たどる深さの上限（これより深い所へは行かない） */
export const TREE_MAX_DEPTH = 32;

interface TreeOptions<T> {
  /** 同じものかを見分ける値（省けばそのもの。ID で引き直す木は ID を渡す） */
  key?: (node: T) => unknown;
  /** 深さの上限（省けば TREE_MAX_DEPTH） */
  max?: number;
}

/** 親をたどった祖先（根 → 親の順。start は入れない）。親が分からない・輪になった・深さの上限に来たら、そこまで */
export function ancestors<T>(start: T, parentOf: (node: T) => T | undefined, { key = (n) => n, max = TREE_MAX_DEPTH }: TreeOptions<T> = {}): T[] {
  const out: T[] = [];
  const seen = new Set<unknown>([key(start)]);
  for (let node = parentOf(start); node !== undefined && out.length < max && !seen.has(key(node)); node = parentOf(node)) {
    seen.add(key(node));
    out.unshift(node);
  }
  return out;
}

/**
 * 根から下へたどる（親のすぐ下に子が続く順。深さは根が 0）。visit が false を返したら、その下へは行かない。
 * 同じものは 2 度通らず（seen に渡したものも通らない）、深さ max の下へは行かない
 */
export function walkDown<T>(
  roots: readonly T[],
  childrenOf: (node: T) => readonly T[],
  visit: (node: T, depth: number) => void | false,
  { key = (n) => n, max = TREE_MAX_DEPTH, seen: seenKeys = [] }: TreeOptions<T> & { seen?: Iterable<unknown> } = {},
): void {
  const seen = new Set<unknown>(seenKeys);
  const walk = (nodes: readonly T[], depth: number) => {
    for (const node of nodes) {
      if (seen.has(key(node))) continue;
      seen.add(key(node));
      if (visit(node, depth) === false || depth >= max) continue;
      walk(childrenOf(node), depth + 1);
    }
  };
  walk(roots, 0);
}
