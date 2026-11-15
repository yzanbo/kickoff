// コアのプロセスが落ちたときに作り直すかと、待つ時間を決める（Electron に依らない純粋関数。メモの仕様書「0023_表示を軽くする」の案 16・U8）

/** 続けて落ちたときの、作り直すまでの待ち（1 回目・2 回目・3 回目以降） */
export const RESTART_DELAYS_MS = [500, 2_000, 5_000] as const;
/** この間に落ちた回数を数える */
export const CRASH_WINDOW_MS = 5 * 60_000;
/** この間に何回落ちたら作り直さずに止めるか（落ち続けるのに作り直すと、毎回 Claude Code・シェルが起動して止まるだけになる） */
export const CRASH_LIMIT = 3;

/**
 * 落ちた時刻の並び（古い順。いま落ちたものを含む）から、作り直すまでの待ち（ms）を返す。作り直さないなら null。
 * 5 分の間に 3 回落ちたら止める。待ちは、前に落ちてから 5 分たたずに続けて落ちた何回目か（続きの長さ）で 0.5 → 2 → 5 秒
 */
export function restartDelay(crashTimes: readonly number[], now: number): number | null {
  const recent = crashTimes.filter((t) => now - t < CRASH_WINDOW_MS);
  if (recent.length >= CRASH_LIMIT) return null;
  let chain = 0;
  for (let i = crashTimes.length - 1; i >= 0; i--) {
    chain++;
    if (i === 0 || crashTimes[i] - crashTimes[i - 1] >= CRASH_WINDOW_MS) break;
  }
  return RESTART_DELAYS_MS[Math.min(Math.max(chain, 1), RESTART_DELAYS_MS.length) - 1];
}
