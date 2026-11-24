import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import type { BusInput } from "@shared/foundation/contract";

/** 書いている途中の返答（chat_delta）をまとめる間隔。画面の 1 フレームに合わせる（1 秒に最大 60 通） */
const DELTA_BATCH_MS = 16;

/**
 * 書いている途中の返答を、チャットごとに DELTA_BATCH_MS の間ためて 1 通にまとめる。
 * ほかの知らせが来たら、ためた分を必ずその前に流す（知らせの順を変えない。確定の記録より前に途中の文が届く）。
 * 変わるのは、続けて届いた同じチャットの途中の文が 1 通につながることだけ
 */
export class DeltaBatch {
  /** チャット ID → ためた文（ためた順） */
  private readonly pending = new Map<number, { project_id: number; text: string }>();
  private timer: TimerHandle | null = null;

  /** clock はためた分を流すタイマー（テストでは手で進めるものを渡す） */
  constructor(
    private readonly emit: (event: BusInput) => void,
    private readonly clock: Pick<Clock, "setTimeout" | "clearTimeout"> = systemClock,
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
    // 16ms で流れる（コアは待ち受けで動き続ける。止めるときは flush を呼ぶ）
    this.timer ??= this.clock.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, DELTA_BATCH_MS);
    return true;
  }

  /** ためた分をすべて流す（タイマー・ほかの知らせの前・止めるとき） */
  flush(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const all = [...this.pending];
    this.pending.clear();
    for (const [chat_id, held] of all) this.emit({ type: "chat_delta", project_id: held.project_id, chat_id, text: held.text });
  }
}
