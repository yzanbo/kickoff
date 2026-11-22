// リポジトリごとの操作の順番（自動のフェッチと、利用者が押した Git の操作）。鍵は共通の .git（同じリポジトリのワークツリー・別プロジェクトで 1 つ）。
// - 自動のフェッチは、前の自動のフェッチから autoFetchMinMs が経っていなければ飛ばす（タブを行き来するたびに通信しない）
// - 利用者の操作の実行中・自動のフェッチの途中は、自動のフェッチを飛ばす
// - 自動のフェッチの途中に利用者が操作したら、フェッチが終わるのを待ってから始める（同時に参照を書き換えると、片方が「cannot lock ref」で失敗するため）
import type { Clock } from "@/foundation/core/clock";

/** user = 利用者が押した操作、fetch = 自動のフェッチ */
export type RepoLockKind = "user" | "fetch";

export interface RepoLock {
  /** key のリポジトリで job を動かす（user はフェッチの途中ならその終わりを待つ。fetch は失敗も含めて終わりを覚える） */
  run<T>(key: string, kind: RepoLockKind, job: () => Promise<T>): Promise<T>;
  /** 自動のフェッチをしてよいか（前の自動のフェッチから間がない・フェッチの途中・利用者の操作中なら false） */
  shouldAutoFetch(key: string): boolean;
}

export function createRepoLock(clock: Pick<Clock, "now">, opts: { autoFetchMinMs: number }): RepoLock {
  const lastAt = new Map<string, number>();
  const fetching = new Map<string, Promise<unknown>>();
  const operating = new Map<string, number>();

  async function runFetch<T>(key: string, job: () => Promise<T>): Promise<T> {
    lastAt.set(key, clock.now());
    const running = job();
    const settled = running.catch(() => undefined);
    fetching.set(key, settled);
    try {
      return await running;
    } finally {
      if (fetching.get(key) === settled) fetching.delete(key);
    }
  }

  async function runUser<T>(key: string, job: () => Promise<T>): Promise<T> {
    operating.set(key, (operating.get(key) ?? 0) + 1);
    try {
      await fetching.get(key);
      return await job();
    } finally {
      const left = (operating.get(key) ?? 1) - 1;
      if (left > 0) operating.set(key, left);
      else operating.delete(key);
    }
  }

  return {
    run: (key, kind, job) => (kind === "fetch" ? runFetch(key, job) : runUser(key, job)),
    shouldAutoFetch(key) {
      if (fetching.has(key) || (operating.get(key) ?? 0) > 0) return false;
      const last = lastAt.get(key);
      return last === undefined || clock.now() - last >= opts.autoFetchMinMs;
    },
  };
}
