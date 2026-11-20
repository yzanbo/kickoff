import { systemClock, type Clock } from "@/foundation/core/clock";

export interface TtlCacheOptions {
  ms: number;
  /** 覚える数の上限（超えたら古い順に捨てる。省けば限りなし） */
  max?: number;
  /** テストで時計を差し替える口 */
  clock?: Pick<Clock, "now">;
}

/**
 * 取った値を ms の間だけ覚えておく小さなキャッシュ（モデル一覧・コマンド一覧・ワークツリーの一覧。空の結果を覚えるかは呼び出し側で決める）。
 * 前の形 ttlCache(ms, clock) は、使う所を選択肢の形に替えるまで残す
 */
export function ttlCache<K, V>(opts: number | TtlCacheOptions, legacyClock: Pick<Clock, "now"> = systemClock) {
  const { ms, max = Infinity, clock = legacyClock } = typeof opts === "number" ? { ms: opts } : opts;
  const entries = new Map<K, { at: number; value: V }>();
  /** 取りに行っている途中（同じキーの同時の頼みは 1 回にまとめる） */
  const loading = new Map<K, Promise<V>>();
  const get = (key: K): V | undefined => {
    const entry = entries.get(key);
    return entry && clock.now() - entry.at < ms ? entry.value : undefined;
  };
  const set = (key: K, value: V) => {
    entries.delete(key);
    entries.set(key, { at: clock.now(), value });
    for (const oldest of entries.keys()) {
      if (entries.size <= max) break;
      entries.delete(oldest);
    }
  };
  return {
    get,
    set,
    /** 覚えた値と、取りに行っている途中の分も捨てる（次の getOrLoad で取り直す。途中の分の結果は覚えない）。key を省けば全部 */
    invalidate(key?: K) {
      if (key === undefined) {
        entries.clear();
        loading.clear();
        return;
      }
      entries.delete(key);
      loading.delete(key);
    },
    /** 覚えていればそれを、なければ load で取って覚える（同じキーの同時の頼みは 1 回にまとめる。失敗は覚えない） */
    getOrLoad(key: K, load: () => Promise<V>): Promise<V> {
      const entry = entries.get(key);
      if (entry && clock.now() - entry.at < ms) return Promise.resolve(entry.value);
      const pending = loading.get(key);
      if (pending) return pending;
      const promise = load().then(
        (value) => {
          if (loading.get(key) === promise) {
            loading.delete(key);
            set(key, value);
          }
          return value;
        },
        (e: unknown) => {
          if (loading.get(key) === promise) loading.delete(key);
          throw e;
        },
      );
      loading.set(key, promise);
      return promise;
    },
  };
}
