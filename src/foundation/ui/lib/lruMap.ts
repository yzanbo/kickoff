/**
 * 数に上限のある Map。上限を超えたら、いちばん長く使っていないものから捨てる（LRU）。
 * get で読んだもの・set で入れ直したものは新しい側へ動かし、peek は順を変えない（覚えにあるかを見るだけのとき）。
 * 重さ（weigh。文字数など）を渡すと、重さの合計が maxWeight を超えないようにも捨てる（1 つで maxWeight を超えるものは入れない）。
 * コードの色付けの覚え（lib/highlightPool.ts）・Mermaid の図の覚え（ui/markdown/mermaid/renderMermaid.ts）・Markdown のブロックの覚え（ui/markdown/markdownProcessor.ts）で使う
 */
export interface LruMap<K, V> {
  /** 読む（新しい側へ動かす）。なければ undefined */
  get(key: K): V | undefined;
  /** 読む（順は変えない）。なければ undefined */
  peek(key: K): V | undefined;
  /** 入れる（新しい側へ）。上限を超えたら古いものから捨てる */
  set(key: K, value: V): void;
  delete(key: K): boolean;
  readonly size: number;
}

/** 重さの上限（weigh で 1 つの重さを決める） */
export interface LruWeight<K, V> {
  maxWeight: number;
  weigh: (value: V, key: K) => number;
}

export function createLruMap<K, V>(limit: number, weight?: LruWeight<K, V>): LruMap<K, V> {
  // Map は入れた順に並ぶので、先頭がいちばん長く使っていないもの
  const map = new Map<K, V>();
  const weights = new Map<K, number>();
  let total = 0;
  const remove = (key: K) => {
    total -= weights.get(key) ?? 0;
    weights.delete(key);
    return map.delete(key);
  };
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as V;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    peek: (key) => map.get(key),
    set(key, value) {
      remove(key);
      if (weight) {
        const w = weight.weigh(value, key);
        if (w > weight.maxWeight) return;
        weights.set(key, w);
        total += w;
      }
      map.set(key, value);
      while (map.size > limit || (weight && total > weight.maxWeight)) remove(map.keys().next().value as K);
    },
    delete: remove,
    get size() {
      return map.size;
    },
  };
}
