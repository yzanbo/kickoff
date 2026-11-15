/**
 * 自動のフェッチ（変更・履歴のタブを開いた・窓に戻った・一定の間隔）と、利用者が押した Git の操作の順番の取り決め。
 * key はリポジトリ（プロジェクト）。ワークツリーどうしはリモートの参照を共有するので、作業場所ごとには分けない。
 * - 自動のフェッチは、前の自動のフェッチから minInterval が経っていなければ飛ばす（タブを行き来するたびに通信しない）
 * - 利用者の操作（プル・プッシュ・ブランチの操作など）の実行中は、自動のフェッチを飛ばす
 * - 自動のフェッチの途中で利用者が操作したら、フェッチが終わるのを待ってから始める（同時に参照を書き換えると、
 *   片方が「cannot lock ref」で失敗するため）
 */
export function createAutoFetcher({ minInterval, now = Date.now }: { minInterval: number; now?: () => number }) {
  const lastAt = new Map<string, number>();
  const running = new Map<string, Promise<unknown>>();
  const operating = new Map<string, number>();

  return {
    /** 自動のフェッチ。飛ばしたら false（失敗は呼ぶ側に返さない。自動なので知らせない） */
    async fetch(key: string, run: () => Promise<unknown>): Promise<boolean> {
      if (running.has(key) || (operating.get(key) ?? 0) > 0) return false;
      const last = lastAt.get(key);
      if (last !== undefined && now() - last < minInterval) return false;
      lastAt.set(key, now());
      const job = run().catch(() => undefined);
      running.set(key, job);
      try {
        await job;
      } finally {
        running.delete(key);
      }
      return true;
    },
    /** 利用者が押した操作。自動のフェッチの途中なら終わるのを待ってから始め、実行中は自動のフェッチを止める */
    async operate<T>(key: string, run: () => Promise<T>): Promise<T> {
      operating.set(key, (operating.get(key) ?? 0) + 1);
      try {
        await running.get(key);
        return await run();
      } finally {
        const left = (operating.get(key) ?? 1) - 1;
        if (left > 0) operating.set(key, left);
        else operating.delete(key);
      }
    },
  };
}

/** 開いた・窓に戻ったときに、前の自動のフェッチからこれだけ経っていなければ取ってこない */
const AUTO_FETCH_MIN_MS = 60_000;

/** 画面全体で 1 つ（プロジェクトの画面・右の欄のどこから開いても、同じリポジトリでは間を空ける） */
export const gitAutoFetch = createAutoFetcher({ minInterval: AUTO_FETCH_MIN_MS });

/** 利用者が押した Git の操作を、自動のフェッチとぶつからない順番で走らせる */
export const runGitOperation = <T>(projectId: number, run: () => Promise<T>): Promise<T> => gitAutoFetch.operate(String(projectId), run);
