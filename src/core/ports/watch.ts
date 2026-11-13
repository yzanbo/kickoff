// ポートを使っているプロセスを調べるとき（一定の間隔では調べない）: 画面が窓を開いた・↻（list）、止めたあと（stop）、
// チャットの 1 回の実行が終わったとき（2 秒待って 1 回。続けて終わったらまとめる）。調べたら SSE の ports で一覧を丸ごと配る。
// 実行が終わったあとに調べて、前に調べたときになかった pid があれば fresh に入れる（画面が下の帯のボタンに点を付ける）
import type { PortProcess } from "@shared/types";
import type { Bus } from "../bus.js";
import type { PortProcessService } from "./service.js";

/** 実行が終わってから調べるまで（サーバーが待ち受けを始めるのを待つ） */
const AFTER_TURN_MS = 2_000;

export class PortWatch {
  /** 前に調べたときの pid（新しく現れたものを見分ける） */
  private known = new Set<number>();
  /** 作業中のチャット（作業中 → それ以外で、実行が終わったとみなす） */
  private readonly running = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** 調べるのは 1 つずつ（重なった頼みは前のものが終わってから） */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly bus: Bus,
    readonly service: PortProcessService,
    private readonly afterTurnMs = AFTER_TURN_MS,
  ) {}

  start(): void {
    this.unsubscribe = this.bus.subscribe((e) => {
      if (e.type !== "chat") return;
      if (e.chat.status === "running") this.running.add(e.chat.id);
      else if (this.running.delete(e.chat.id)) this.schedule();
    });
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 調べて配る（markFresh = 前になかった pid を新しく現れたものとして知らせる。実行が終わったときだけ） */
  check(markFresh = false): Promise<PortProcess[]> {
    const run = this.chain.then(async () => {
      const processes = await this.service.list();
      const fresh = markFresh ? processes.filter((p) => !this.known.has(p.pid)).map((p) => p.pid) : [];
      this.known = new Set(processes.map((p) => p.pid));
      this.bus.publish({ type: "ports", processes, fresh });
      return processes;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** 止めてから調べ直す（止まったかを返す） */
  async stop(pid: number, command: string, force: boolean): Promise<boolean> {
    try {
      return await this.service.stop(pid, command, force);
    } finally {
      void this.check().catch(() => undefined);
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check(true).catch(() => undefined);
    }, this.afterTurnMs);
  }
}
