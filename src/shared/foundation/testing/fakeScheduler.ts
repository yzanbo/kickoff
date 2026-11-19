// 手で進める偽の rAF・手すき・タイマー・時計（テストからだけ使う）。create*(deps) に渡す口（frame・idle・timer・now）の形で、
// 画面とコアのテストが同じものを使う。Node・DOM に依存しない

/** 手で進める偽の rAF・手すき・タイマー・時計（create*(deps) に渡す口の形） */
export interface FakeScheduler {
  /** 次のフレームの予約（取り消す関数を返す） */
  frame(fn: () => void): () => void;
  /** 手すきの予約 */
  idle(fn: () => void): () => void;
  /** ms 後の予約 */
  timer(fn: () => void, ms: number): () => void;
  /** いまの時刻（ms。advance で進む） */
  now(): number;
  /** 予約されたフレームを 1 回描く */
  runFrames(): void;
  /** 手すきの予約を全部呼ぶ */
  runIdle(): void;
  /** 時計を進め、時刻の来たタイマーを時刻の順に呼ぶ */
  advance(ms: number): void;
  /** 待っているものの数 */
  readonly pending: { frames: number; idles: number; timers: number };
}

/** 予約 1 つ（同じ関数を 2 回予約しても別のものとして数える） */
interface Entry {
  fn: () => void;
  /** 呼ぶ時刻（タイマーだけが使う） */
  at: number;
  cancelled: boolean;
}

/** 偽の時計を作る（時刻は start から始まる）。口は this を使わないので、関数だけを渡してよい */
export function createFakeScheduler(start = 0): FakeScheduler {
  let now = start;
  const frames: Entry[] = [];
  const idles: Entry[] = [];
  const timers: Entry[] = [];
  /** 列に予約を足し、取り消す関数を返す（取り消したものは、呼んでいる回の途中でも呼ばない） */
  const schedule = (list: Entry[], fn: () => void, at: number) => {
    const entry: Entry = { fn, at, cancelled: false };
    list.push(entry);
    return () => {
      entry.cancelled = true;
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    };
  };
  /** 列にある分を予約した順に呼ぶ（呼んでいる間に予約したものは次の回） */
  const drain = (list: Entry[]) => {
    for (const entry of list.splice(0)) if (!entry.cancelled) entry.fn();
  };
  return {
    frame: (fn) => schedule(frames, fn, now),
    idle: (fn) => schedule(idles, fn, now),
    timer: (fn, ms) => schedule(timers, fn, now + ms),
    now: () => now,
    runFrames: () => drain(frames),
    runIdle: () => drain(idles),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        // 時刻のいちばん早いもの（同じ時刻なら先に予約したもの）を 1 つずつ、時計をその時刻にしてから呼ぶ。呼んだ中で予約したものも until までなら呼ぶ
        let due: Entry | undefined;
        for (const t of timers) if (t.at <= until && (!due || t.at < due.at)) due = t;
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        now = due.at;
        due.fn();
      }
      now = until;
    },
    get pending() {
      return { frames: frames.length, idles: idles.length, timers: timers.length };
    },
  };
}
