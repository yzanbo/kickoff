import { EventEmitter } from "node:events";
import type { BusEvent } from "@shared/types";
import { DeltaBatch, type DeltaTimers } from "./chat/deltaBatch.js";
import { noteSyncSince, syncStart } from "./system/stallWatch.js";

/**
 * コア内の変更をクライアント（SSE）へ配信するためのイベントバス。
 * 書いている途中の返答（chat_delta）はチャットごとに 16ms ためて 1 通にまとめ、ほかの知らせを流す前に必ず先に流す（`chat/deltaBatch.ts`。
 * 知らせはすべてここを通るので、どの購読者から見ても順は変わらない。メモの仕様書「0023_表示を軽くする」の案 13）
 */
export class Bus {
  private readonly emitter = new EventEmitter();
  private readonly deltas: DeltaBatch;

  /** timers はテストで差し替える（ためた途中の返答を流すタイマー） */
  constructor(timers?: DeltaTimers) {
    // 接続中のクライアント数ぶん購読が増えるため上限を外す
    this.emitter.setMaxListeners(0);
    this.deltas = new DeltaBatch((event) => this.emit(event), timers);
  }

  publish(event: BusEvent) {
    if (this.deltas.accept(event)) return;
    this.emit(event);
  }

  /** ためている途中の返答をすぐ流す（コアを止めるとき） */
  flushDeltas() {
    this.deltas.flush();
  }

  private emit(event: BusEvent) {
    // 配る相手（SSE・通知など）の処理の合計を、詰まりの見張りに知らせる（system/stallWatch.ts）
    const start = syncStart();
    this.emitter.emit("event", event);
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
