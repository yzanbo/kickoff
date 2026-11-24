import { systemClock, type Clock } from "@/foundation/core/clock";

export interface TtlCacheOptions {
  ms: number;
  /** 覚える数の上限（超えたら古い順に捨てる。省けば限りなし） */
  max?: number;
  /** テストで時計を差し替える口 */
  clock?: Pick<Clock, "now">;
}

export interface TtlCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): void;
  /** 当てはまるキーの覚えを捨てる（プロジェクトのものをまとめて、など） */
  deleteWhere(match: (key: K) => boolean): void;
  /** 覚えた値と、取りに行っている途中の分も捨てる（次の getOrLoad で取り直す。途中の分の結果は覚えない）。key を省けば全部 */
  invalidate(key?: K): void;
  clear(): void;
  /** 取ったら消す（一度だけの番号。期限が切れていれば undefined） */
  take(key: K): V | undefined;
  /** 覚えていればそれを、なければ load で取って覚える（同じキーの同時の頼みは 1 回にまとめる。失敗は覚えない） */
  getOrLoad(key: K, load: () => Promise<V>): Promise<V>;
}

/** 取った値を ms の間だけ覚えておく小さなキャッシュ（モデル一覧・コマンド一覧・ワークツリーの一覧・一度だけの番号。空の結果を覚えるかは呼び出し側で決める） */
export function ttlCache<K, V>({ ms, max = Infinity, clock = systemClock }: TtlCacheOptions): TtlCache<K, V> {
  const entries = new Map<K, { at: number; value: V }>();
  /** 取りに行っている途中（同じキーの同時の頼みは 1 回にまとめる） */
  const loading = new Map<K, Promise<V>>();
  const fresh = (key: K) => {
    const entry = entries.get(key);
    return entry && clock.now() - entry.at < ms ? entry : undefined;
  };
  const set = (key: K, value: V) => {
    entries.delete(key);
    entries.set(key, { at: clock.now(), value });
    for (const oldest of entries.keys()) {
      if (entries.size <= max) break;
      entries.delete(oldest);
    }
  };
  const invalidate = (key?: K) => {
    if (key === undefined) {
      entries.clear();
      loading.clear();
      return;
    }
    entries.delete(key);
    loading.delete(key);
  };
  return {
    get: (key) => fresh(key)?.value,
    set,
    delete: (key) => void entries.delete(key),
    deleteWhere(match) {
      for (const key of [...entries.keys()]) if (match(key)) entries.delete(key);
    },
    invalidate,
    clear: () => invalidate(),
    take(key) {
      const value = fresh(key)?.value;
      entries.delete(key);
      return value;
    },
    getOrLoad(key, load) {
      const entry = fresh(key);
      if (entry) return Promise.resolve(entry.value);
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
