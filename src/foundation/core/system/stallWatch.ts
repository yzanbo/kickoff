import { PerformanceObserver } from "node:perf_hooks";

// イベントループの詰まりの見張り。一定の間隔のタイマーの遅れで止まった長さを測り、
// その間にいちばん長かった同期の処理（timed / noteSync で名前を付けたもの）と一緒に知らせる。
// 重いときに診断を押した 10 秒の間しか測れず、気づいたときには原因が消えていたため、いつも見張る。Electron に依らない（メインもコアも使う）

/** 見張りの刻み（ms） */
export const STALL_TICK_MS = 200;
/** これを超えてタイマーが遅れたら記録する（ms） */
export const STALL_MS = 500;
/** 名前を覚える下限（ms）。これ以下の処理は名前の文字列も作らない */
const LABEL_MIN_MS = 20;
/** 同じ処理の詰まりを 1 行にまとめる長さ（ms） */
const STALL_REPEAT_MS = 10_000;

export type StallProcess = "main" | "core";

export interface StallRecord {
  /** 止まり終えた時刻（ISO） */
  at: string;
  process: StallProcess;
  pid: number;
  /** タイマーの遅れ（刻みの間隔を引いたもの。ms） */
  blockedMs: number;
  /** その間にいちばん長かった名前付きの同期の処理 */
  task: string | null;
  taskMs: number | null;
  /** その間に使った CPU（ms） */
  cpuMs: number;
  /** その間の GC（ms） */
  gcMs: number;
  /** CPU を使って（か名前付きの処理で）止まっていれば blocked、どちらでもなければ throttled（App Nap などでタイマーが間引かれただけ） */
  kind: "blocked" | "throttled";
  rssMB: number;
  /** STALL_REPEAT_MS の間にまとめた数（まとめていなければない）。blockedMs・taskMs はその中のいちばん長いもの */
  repeat?: number;
}

/** 時計・タイマー・CPU など（テストは偽物を渡す） */
export interface StallClock {
  now(): number;
  /** ms ごとに fn を呼び、止める関数を返す */
  every(ms: number, fn: () => void): () => void;
  /** これまでに使った CPU（ms。user ＋ system） */
  cpuMs(): number;
  /** これまでの GC の時間（ms） */
  gcMs(): number;
  rssMB(): number;
}

/** 本物の時計（performance.now は macOS では眠っている間に進まないので、スリープは遅れに入らない） */
function systemClock(): { clock: StallClock; dispose: () => void } {
  let gc = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) gc += entry.duration;
  });
  observer.observe({ entryTypes: ["gc"] });
  const clock: StallClock = {
    now: () => performance.now(),
    every: (ms, fn) => {
      const timer = setInterval(fn, ms);
      timer.unref();
      return () => clearInterval(timer);
    },
    cpuMs: () => {
      const { user, system } = process.cpuUsage();
      return (user + system) / 1000;
    },
    gcMs: () => gc,
    rssMB: () => Math.round(process.memoryUsage.rss() / 1048576),
  };
  return { clock, dispose: () => observer.disconnect() };
}

/** いま動いている見張り（名前付きの処理はここへ覚える。なければ測らない） */
let active: { now: () => number; longest: { task: string; ms: number } | null } | null = null;

const round = (ms: number) => Math.round(ms);

/**
 * 詰まりの見張りを始め、止める関数を返す。STALL_MS を超えてタイマーが遅れたら onStall に渡す
 * （同じ処理の詰まりは STALL_REPEAT_MS に 1 行へまとめる）。同時に動かせるのは 1 つ（新しく始めたほうが名前を受け取る）
 */
export function startStallWatch(opts: { process: StallProcess; onStall: (record: StallRecord) => void; clock?: StallClock }): () => void {
  const system = opts.clock ? null : systemClock();
  const clock = opts.clock ?? system!.clock;
  const state: NonNullable<typeof active> = { now: () => clock.now(), longest: null };
  active = state;
  let last = clock.now();
  let lastCpu = clock.cpuMs();
  let lastGc = clock.gcMs();
  /** まとめている詰まり（処理ごと）: 最後に書いた時刻と、それ以後にまとめた分 */
  const groups = new Map<string, { emittedAt: number; pending: StallRecord | null }>();

  const flush = (now: number, all: boolean) => {
    for (const [key, group] of groups) {
      if (!all && now - group.emittedAt < STALL_REPEAT_MS) continue;
      if (group.pending) {
        opts.onStall(group.pending);
        group.emittedAt = now;
        group.pending = null;
      } else groups.delete(key);
    }
  };

  const tick = () => {
    const now = clock.now();
    const cpu = clock.cpuMs();
    const gc = clock.gcMs();
    const blockedMs = now - last - STALL_TICK_MS;
    const longest = state.longest;
    const cpuMs = cpu - lastCpu;
    const gcMs = gc - lastGc;
    last = now;
    lastCpu = cpu;
    lastGc = gc;
    state.longest = null;
    if (blockedMs > STALL_MS) {
      // 同期の I/O（execFileSync など）は CPU を使わずに止めるので、名前付きの処理が半分以上を占めていれば blocked
      const busy = cpuMs >= blockedMs / 2 || (longest?.ms ?? 0) >= blockedMs / 2;
      const record: StallRecord = {
        at: new Date().toISOString(),
        process: opts.process,
        pid: process.pid,
        blockedMs: round(blockedMs),
        task: longest?.task ?? null,
        taskMs: longest ? round(longest.ms) : null,
        cpuMs: round(cpuMs),
        gcMs: round(gcMs),
        kind: busy ? "blocked" : "throttled",
        rssMB: clock.rssMB(),
      };
      const key = `${record.kind}:${record.task ?? ""}`;
      const group = groups.get(key);
      if (!group) {
        groups.set(key, { emittedAt: now, pending: null });
        opts.onStall(record);
      } else if (group.pending) {
        const p = group.pending;
        group.pending = { ...record, blockedMs: Math.max(p.blockedMs, record.blockedMs), taskMs: maxOrNull(p.taskMs, record.taskMs), repeat: (p.repeat ?? 1) + 1 };
      } else group.pending = { ...record, repeat: 1 };
    }
    flush(now, false);
  };

  const stopTimer = clock.every(STALL_TICK_MS, tick);
  return () => {
    stopTimer();
    flush(clock.now(), true);
    system?.dispose();
    if (active === state) active = null;
  };
}

const maxOrNull = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/**
 * 名前付きの同期の処理にかかった時間を覚える（次の見張りの刻みまでの、いちばん長いもの）。
 * label は LABEL_MIN_MS を超えたときだけ作る（関数で渡せば、速いときは文字列を作らない）
 */
export function noteSync(label: string | (() => string), ms: number): void {
  const state = active;
  if (!state || ms <= LABEL_MIN_MS || (state.longest && state.longest.ms >= ms)) return;
  state.longest = { task: typeof label === "string" ? label : label(), ms };
}

/** 同期の処理の始まりの時刻（noteSyncSince に渡す。見張りが動いていなければ測らない印） */
export function syncStart(): number {
  return active ? active.now() : Number.NaN;
}

/** syncStart からの時間を名前付きで覚える（関数の形にしにくい所。for await の 1 回の中身など） */
export function noteSyncSince(start: number, label: string | (() => string)): void {
  if (active && !Number.isNaN(start)) noteSync(label, active.now() - start);
}

/** 同期の処理に名前を付けて測る（label を関数にすれば、引数から名前を作る。返す値・投げる例外は変えない） */
export function timed<A extends unknown[], R>(label: string | ((...args: NoInfer<A>) => string), fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    const state = active;
    if (!state) return fn(...args);
    const start = state.now();
    try {
      return fn(...args);
    } finally {
      noteSync(typeof label === "string" ? label : () => label(...args), state.now() - start);
    }
  };
}
