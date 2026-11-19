// コードの色付けを Web Worker に頼む待ち行列。
// Worker を作る関数（spawn）を受け取って作る（画面は lib/highlightWorkerEntry.ts の 1 つを使い、テストは偽の Worker を渡す。?worker はここで import しない）
import type { AppliedTheme } from "./appliedTheme";
import { isHighlightLanguage } from "./highlightLanguages";
import { createLruMap } from "./lruMap";
import { decodeTokens, type CodeToken, type EncodedTokens } from "./tokenCodec";

/** 画面から Worker へ頼む 1 件 */
export interface HighlightJob {
  id: number;
  code: string;
  lang: string;
  theme: string;
}

/** Worker からの返事（詰めた結果か、詰められなかった断片か、色を付けない・失敗の null） */
export type HighlightReply = { id: number; encoded: EncodedTokens } | { id: number; tokens: CodeToken[][] | null; failed?: boolean };

/** Worker として使うもの（本物の Worker と、テストの偽物） */
export interface HighlightWorker {
  postMessage(job: HighlightJob): void;
  addEventListener(type: "message", listener: (e: MessageEvent<HighlightReply>) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  terminate(): void;
}

/** 急ぎの度合い（visible: 開いた欄など見えているもの・near: 画面の手前まで来たもの。visible を先に色付けする） */
export type HighlightPriority = "visible" | "near";

export interface HighlightPool {
  /** 色付けする（色を付けない言語・長すぎるコード・失敗は null）。signal で取り消すと、まだ始めていなければ捨てる（null で終わる） */
  highlight(code: string, lang: string | undefined, theme: AppliedTheme, opts?: { priority?: HighlightPriority; signal?: AbortSignal }): Promise<CodeToken[][] | null>;
  /** 覚えている結果（同期。最初の描画から色付きで出すため）。色を付けないと分かっていれば null、まだなければ undefined */
  peek(code: string, lang: string | undefined, theme: AppliedTheme): CodeToken[][] | null | undefined;
  /** Worker を止め、待っているものをすべて null で終える */
  dispose(): void;
}

/** これより長いコードは色を付けない（重くならないように） */
export const HIGHLIGHT_MAX_CHARS = 300_000;
/** 結果を覚える数・字数の合計・1 件の字数の上限（窓で行が外れて戻ったときに色付けし直さない。大きなファイルでメモリを埋めない） */
export const HIGHLIGHT_CACHE = { count: 512, chars: 4_000_000, maxItem: 200_000 };

interface Job {
  id: number;
  key: string;
  code: string;
  lang: string;
  theme: AppliedTheme;
  priority: HighlightPriority;
  waiters: Set<(tokens: CodeToken[][] | null) => void>;
}

interface Slot {
  worker: HighlightWorker | null;
  job: Job | null;
}

export function createHighlightPool({ spawn, size = 1 }: { spawn: () => HighlightWorker; size?: number }): HighlightPool {
  const cache = createLruMap<string, CodeToken[][]>(HIGHLIGHT_CACHE.count, { maxWeight: HIGHLIGHT_CACHE.chars, weigh: (_v, key) => key.length });
  /** 始める前のもの（急ぎの度合いごと。古い順） */
  const queues: Record<HighlightPriority, Job[]> = { visible: [], near: [] };
  /** 待っているか動いているもの（同じコードを 2 回頼まない） */
  const jobs = new Map<string, Job>();
  const slots: Slot[] = Array.from({ length: size }, () => ({ worker: null, job: null }));
  let nextId = 1;
  let disposed = false;

  const keyOf = (code: string, lang: string, theme: string) => `${theme}\u0000${lang}\u0000${code}`;

  const finish = (job: Job, tokens: CodeToken[][] | null) => {
    jobs.delete(job.key);
    for (const done of job.waiters) done(tokens);
    job.waiters.clear();
  };

  const workerOf = (slot: Slot): HighlightWorker => {
    if (slot.worker) return slot.worker;
    const worker = spawn();
    worker.addEventListener("message", (e) => {
      const job = slot.job;
      if (!job || e.data.id !== job.id) return;
      slot.job = null;
      const tokens = "encoded" in e.data ? decodeTokens(job.code, e.data.encoded) : e.data.tokens;
      if (tokens && job.code.length <= HIGHLIGHT_CACHE.maxItem) cache.set(job.key, tokens);
      finish(job, tokens);
      pump();
    });
    worker.addEventListener("error", () => {
      // 落ちた Worker は捨て、次に頼むときに作り直す
      const job = slot.job;
      slot.job = null;
      slot.worker = null;
      worker.terminate();
      if (job) finish(job, null);
      pump();
    });
    slot.worker = worker;
    return worker;
  };

  const pump = () => {
    if (disposed) return;
    for (const slot of slots) {
      if (slot.job) continue;
      const job = queues.visible.shift() ?? queues.near.shift();
      if (!job) return;
      slot.job = job;
      workerOf(slot).postMessage({ id: job.id, code: job.code, lang: job.lang, theme: job.theme });
    }
  };

  const unqueue = (job: Job) => {
    const queue = queues[job.priority];
    const at = queue.indexOf(job);
    if (at >= 0) queue.splice(at, 1);
    return at >= 0;
  };

  return {
    highlight(code, lang, theme, opts = {}) {
      if (disposed || !isHighlightLanguage(lang) || code.length > HIGHLIGHT_MAX_CHARS) return Promise.resolve(null);
      const key = keyOf(code, lang, theme);
      const cached = cache.get(key);
      if (cached) return Promise.resolve(cached);
      const priority = opts.priority ?? "visible";
      return new Promise((resolve) => {
        let job = jobs.get(key);
        if (!job) {
          job = { id: nextId++, key, code, lang, theme, priority, waiters: new Set() };
          jobs.set(key, job);
          queues[priority].push(job);
        } else if (priority === "visible" && job.priority === "near" && unqueue(job)) {
          // 急ぐものとして頼み直された（まだ始めていなければ前へ）
          job.priority = "visible";
          queues.visible.push(job);
        }
        const current = job;
        current.waiters.add(resolve);
        opts.signal?.addEventListener(
          "abort",
          () => {
            if (!current.waiters.delete(resolve)) return;
            resolve(null);
            // 誰も待たなくなった、まだ始めていないものは捨てる（遠くへ移って外れたコードを、あとで無駄に色付けしない）
            if (current.waiters.size === 0 && unqueue(current)) jobs.delete(current.key);
          },
          { once: true },
        );
        pump();
      });
    },
    peek(code, lang, theme) {
      if (!isHighlightLanguage(lang) || code.length > HIGHLIGHT_MAX_CHARS) return null;
      return cache.peek(keyOf(code, lang, theme));
    },
    dispose() {
      disposed = true;
      for (const slot of slots) {
        slot.worker?.terminate();
        slot.worker = null;
        slot.job = null;
      }
      for (const job of [...jobs.values()]) finish(job, null);
      queues.visible = [];
      queues.near = [];
    },
  };
}
