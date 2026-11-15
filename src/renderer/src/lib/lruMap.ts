/**
 * 数に上限のある Map。上限を超えたら、いちばん長く使っていないものから捨てる（LRU）。
 * get で読んだもの・set で入れ直したものは新しい側へ動かし、peek は順を変えない（覚えにあるかを見るだけのとき）。
 * コードの色付けの覚え（lib/highlight.ts）・Mermaid の図の覚え（ui/markdown/mermaid/renderMermaid.ts）で使う
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

export function createLruMap<K, V>(limit: number): LruMap<K, V> {
  // Map は入れた順に並ぶので、先頭がいちばん長く使っていないもの
  const map = new Map<K, V>();
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
      map.delete(key);
      map.set(key, value);
      while (map.size > limit) map.delete(map.keys().next().value as K);
    },
    delete: (key) => map.delete(key),
    get size() {
      return map.size;
    },
  };
}
