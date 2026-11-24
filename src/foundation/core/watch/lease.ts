// 見ている間だけ動かす貸し出し（Docker の知らせなど）。キーごとに touch で期限を延ばし、最初の 1 つで onFirst、全部が外れたら onEmpty
import type { Clock, TimerHandle } from "@/foundation/core/clock";

export interface Lease<K> {
  /** key を ttlMs のあいだ借りている印にする（借り手がいなかったら onFirst） */
  touch(key: K): void;
  /** key を返す（借り手がいなくなったら onEmpty） */
  release(key: K): void;
  /** 借りているキー */
  readonly active: ReadonlySet<K>;
}

export interface LeaseOptions {
  /** touch から外れるまで */
  ttlMs: number;
  /** 期限の切れたキーを外す間隔（借り手がいる間だけ見る） */
  sweepMs: number;
  onFirst(): void;
  onEmpty(): void;
  clock: Clock;
}

export function createLease<K>(opts: LeaseOptions): Lease<K> {
  const { clock } = opts;
  /** キー → 期限の時刻 */
  const until = new Map<K, number>();
  const keys = new Set<K>();
  let sweeper: TimerHandle | null = null;
  const remove = (key: K) => {
    until.delete(key);
    keys.delete(key);
  };
  const emptied = () => {
    if (keys.size > 0) return;
    clock.clearInterval(sweeper);
    sweeper = null;
    opts.onEmpty();
  };
  const sweep = () => {
    const now = clock.now();
    for (const [key, at] of until) if (at <= now) remove(key);
    emptied();
  };
  return {
    touch(key) {
      const first = keys.size === 0;
      until.set(key, clock.now() + opts.ttlMs);
      keys.add(key);
      if (!first) return;
      sweeper = clock.setInterval(sweep, opts.sweepMs);
      opts.onFirst();
    },
    release(key) {
      if (!keys.has(key)) return;
      remove(key);
      emptied();
    },
    active: keys,
  };
}
