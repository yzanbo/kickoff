/** 取った値を ms の間だけ覚えておく小さなキャッシュ（モデル一覧・コマンド一覧。空の結果を覚えるかは呼び出し側で決める） */
export function ttlCache<K, V>(ms: number) {
  const entries = new Map<K, { at: number; value: V }>();
  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      return entry && Date.now() - entry.at < ms ? entry.value : undefined;
    },
    set(key: K, value: V) {
      entries.set(key, { at: Date.now(), value });
    },
  };
}
