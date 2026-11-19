import { EventEmitter } from "node:events";
import type { BusEvent, BusInput } from "@shared/types";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";

/**
 * 配る前に通す段（機能が use で登録する。例: chat の書きかけの返答をまとめる段 `@/features/chat/core/deltaStage.ts`）。
 * 段は知らない種類をそのまま通す
 */
export interface BusStage {
  /** 受け取ったら true（その場では配らない。あとで emit で、次の段から通して配る） */
  accept?(event: BusInput, emit: (event: BusInput) => void): boolean;
  /** 配る直前に知らせを足し直す（offset を付けるなど） */
  track?(event: BusInput): BusEvent;
  /** ためているものをすぐ配る（コアを止めるとき） */
  flush?(): void;
}

/**
 * コア内の変更をクライアント（SSE）へ配る運び手。機能の言葉は持たず、配る前の段（BusStage）を登録の順に通す。
 * 知らせはすべてここを通るので、どの購読者から見ても順は変わらない
 */
export class Bus {
  private readonly emitter = new EventEmitter();
  private readonly stages: BusStage[] = [];

  constructor() {
    // 接続中のクライアント数ぶん購読が増えるため上限を外す
    this.emitter.setMaxListeners(0);
  }

  /** 配る前の段を足す（登録の順に通す） */
  use(stage: BusStage): void {
    this.stages.push(stage);
  }

  publish(event: BusInput): void {
    this.pass(event, 0);
  }

  /** ためているものをすぐ配る（コアを止めるとき） */
  flush(): void {
    for (const stage of this.stages) stage.flush?.();
  }

  /** from 番目の段から通す（受け取った段は、あとで次の段から通す） */
  private pass(event: BusInput, from: number): void {
    for (let i = from; i < this.stages.length; i++) {
      if (this.stages[i].accept?.(event, (later) => this.pass(later, i + 1))) return;
    }
    this.deliver(event);
  }

  private deliver(event: BusInput): void {
    // 配る相手（SSE・通知など）の処理の合計を、詰まりの見張りに知らせる（system/stallWatch.ts）
    const start = syncStart();
    let out: BusInput = event;
    for (const stage of this.stages) if (stage.track) out = stage.track(out);
    this.emitter.emit("event", out);
    noteSyncSince(start, () => `bus:${event.type}`);
  }

  subscribe(listener: (event: BusEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  /** いま購読しているものの数（ほとんどは画面の SSE。性能の記録で、増え続けていないかを見る） */
  listenerCount(): number {
    return this.emitter.listenerCount("event");
  }
}
