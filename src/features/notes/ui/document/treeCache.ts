// 読み取りの木と文から作る結果を、同じ木と文には同じものを返すように覚える（飾りの組み立てで何度も呼ぶため。木が替われば作り直す）
import type { Tree } from "@lezer/common";

export function cacheByTree<T>(compute: (tree: Tree, text: string) => T): (tree: Tree, text: string) => T {
  const known = new WeakMap<Tree, { text: string; value: T }>();
  return (tree, text) => {
    const hit = known.get(tree);
    if (hit && hit.text === text) return hit.value;
    const value = compute(tree, text);
    known.set(tree, { text, value });
    return value;
  };
}
