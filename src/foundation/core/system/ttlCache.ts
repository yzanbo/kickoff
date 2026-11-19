import { systemClock, type Clock } from "@/foundation/core/clock";

/** 取った値を ms の間だけ覚えておく小さなキャッシュ（モデル一覧・コマンド一覧。空の結果を覚えるかは呼び出し側で決める）。clock はテストで時計を差し替える口 */
export function ttlCache<K, V>(ms: number, clock: Pick<Clock, "now"> = systemClock) {
  const entries = new Map<K, { at: number; value: V }>();
  return {
    get(key: K): V | undefined {
      const entry = entries.get(key);
      return entry && clock.now() - entry.at < ms ? entry.value : undefined;
    },
    set(key: K, value: V) {
      entries.set(key, { at: clock.now(), value });
    },
  };
}
