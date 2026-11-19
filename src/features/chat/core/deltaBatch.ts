import type { BusInput } from "./streamingTexts";

/** 書いている途中の返答（chat_delta）をまとめる間隔。画面の 1 フレームに合わせる（1 秒に最大 60 通） */
const DELTA_BATCH_MS = 16;

/** タイマーの口（テストでは `testing/fakeTimers.ts` に差し替える） */
export interface DeltaTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: DeltaTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as NodeJS.Timeout) };

/**
 * 書いている途中の返答を、チャットごとに DELTA_BATCH_MS の間ためて 1 通にまとめる。
 * ほかの知らせが来たら、ためた分を必ずその前に流す（知らせの順を変えない。確定の記録より前に途中の文が届く）。
 * 変わるのは、続けて届いた同じチャットの途中の文が 1 通につながることだけ
 */
export class DeltaBatch {
  /** チャット ID → ためた文（ためた順） */
  private readonly pending = new Map<number, { project_id: number; text: string }>();
  private timer: unknown = null;

  constructor(
    private readonly emit: (event: BusInput) => void,
    private readonly timers: DeltaTimers = realTimers,
  ) {}

  /** chat_delta ならためる（true）。ほかの知らせなら、ためた分を先に流す（false。その知らせは呼んだ側が流す） */
  accept(event: BusInput): boolean {
    if (event.type !== "chat_delta") {
      this.flush();
      return false;
    }
    const held = this.pending.get(event.chat_id);
    if (held) held.text += event.text;
    else this.pending.set(event.chat_id, { project_id: event.project_id, text: event.text });
    // タイマーは unref しない（16ms で必ず流れる。止めるときは flush を呼ぶ）
    this.timer ??= this.timers.set(() => {
      this.timer = null;
      this.flush();
    }, DELTA_BATCH_MS);
    return true;
  }

  /** ためた分をすべて流す（タイマー・ほかの知らせの前・止めるとき） */
  flush(): void {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const all = [...this.pending];
    this.pending.clear();
    for (const [chat_id, held] of all) this.emit({ type: "chat_delta", project_id: held.project_id, chat_id, text: held.text });
  }
}
