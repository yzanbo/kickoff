// チャットの先読みの順番待ち（メモの仕様書「0023_表示を軽くする」の案 4・分冊 3 の 1-4-7）。React に依存しない（アプリの 1 つは useChatStore.ts）。
// 先読みは開く速さのためのもので、いま見ているものの邪魔をしない: 同時に 1 件まで・手すきのときに 1 件ずつ・見ているチャットの読み込み中は待つ。
// 待っているのは新しく頼んだものを先に PREFETCH_QUEUE 件まで（古い頼みは捨てる）

/** 待たせておく数（パネルの表のタブに近い 5 件と同じ） */
export const PREFETCH_QUEUE = 5;
/** 手すきを待つ長さの上限（来なければこの時間で始める） */
const PREFETCH_IDLE_MS = 2000;
/** 見ているチャットの読み込み中に、次に確かめるまで待つ長さ */
export const PREFETCH_RETRY_MS = 300;

export interface PrefetchDeps {
  /** 1 件を先読みする（読み終えたら解決する） */
  prefetch: (chatId: number) => Promise<void>;
  /** 見ているチャットを読み込んでいる最中か */
  busy: () => boolean;
  idle: (fn: () => void, timeout: number) => () => void;
  timer: (fn: () => void, ms: number) => () => void;
}

export function createPrefetchQueue(deps: PrefetchDeps) {
  let queue: number[] = [];
  let running = false;
  let cancel: (() => void) | null = null;

  const pump = () => {
    if (running || cancel || queue.length === 0) return;
    cancel = deps.idle(() => {
      cancel = null;
      if (queue.length === 0) return;
      if (deps.busy()) {
        cancel = deps.timer(() => {
          cancel = null;
          pump();
        }, PREFETCH_RETRY_MS);
        return;
      }
      const chatId = queue.shift()!;
      running = true;
      void deps
        .prefetch(chatId)
        .catch(() => undefined)
        .finally(() => {
          running = false;
          pump();
        });
    }, PREFETCH_IDLE_MS);
  };

  return {
    /** 先読みを頼む（先に書いたものほど先に読む。前の頼みより先に回す） */
    request(chatIds: readonly number[]) {
      queue = [...new Set([...chatIds, ...queue])].slice(0, PREFETCH_QUEUE);
      pump();
    },
    /** 待っている頼み（テスト用） */
    pending: (): readonly number[] => queue,
  };
}
