/** 止めたあと、AI がいまの作業の終わりを返すまで待つ長さ（過ぎたら作業の終わりを待たずに中断で返す） */
export const STOP_GRACE_MS = 5000;

export interface Stopper {
  /** 止める合図の受け手と、待つタイマーを外す（実行の終わりに呼ぶ） */
  dispose(): void;
}

/**
 * 止める合図を受ける（Codex・Copilot・ACP の実行が同じ形で使う）。合図が来たら interrupt を呼び、graceMs 待って onForced を呼ぶ。
 * 足したときにもう止められていれば、すぐ同じことをする（止めたあとに足した abort の受け手は呼ばれないため）
 */
export function createStopper(signal: AbortSignal, opts: { interrupt: () => void; graceMs?: number; onForced: () => void }): Stopper {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    opts.interrupt();
    timer = setTimeout(opts.onForced, opts.graceMs ?? STOP_GRACE_MS);
    timer.unref?.();
  };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  return {
    dispose: () => {
      signal.removeEventListener("abort", stop);
      if (timer) clearTimeout(timer);
    },
  };
}
