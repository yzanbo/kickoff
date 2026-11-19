/** 取った値を ms の間だけ覚えておく小さなキャッシュ（モデル一覧・コマンド一覧。空の結果を覚えるかは呼び出し側で決める）。now はテストで時計を差し替える口 */
export function ttlCache<K, V>(ms: number, now: () => number = Date.now) {
  const entries = new Map<K, { at: number; value: V }>();
  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      return entry && now() - entry.at < ms ? entry.value : undefined;
    },
    set(key: K, value: V) {
      entries.set(key, { at: now(), value });
    },
  };
}
