import { isNetworkError } from "@shared/ai/networkErrors";
import { isUsageLimitError } from "@/features/ai/core/providers/shared/usageLimit";

/** 承認カードの答えを待つ長さ（秒。7 日。フック・MCP のツールの待ち時間。答える前に閉じると拒否になるため長く） */
export const APPROVAL_WAIT_S = 7 * 24 * 60 * 60;
/** ツールなしで 1 回だけ聞くときに、答えを待つ長さ */
export const ASK_TIMEOUT_MS = 120_000;
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

/** 待つ約束に時間の上限を付ける（過ぎたら message の失敗にする） */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)));
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 失敗の文から、結果に添える印（使用枠の上限 usageLimit・通信の切断 network）を作る。hints は CLI が種類で知らせたもの。
 * 使用枠の上限なら通信の切断にはしない（再開の決まりが違うため）
 */
export function failureFlags(message: string, hints: { usageLimit?: boolean; network?: boolean } = {}): { network?: true; usageLimit?: { resetsAt: null } } {
  const usageLimit = Boolean(hints.usageLimit) || isUsageLimitError(message);
  const network = !usageLimit && (Boolean(hints.network) || isNetworkError(message));
  return { ...(network ? { network: true as const } : {}), ...(usageLimit ? { usageLimit: { resetsAt: null } } : {}) };
}
