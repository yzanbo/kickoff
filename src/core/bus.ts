import { EventEmitter } from "node:events";
import type { BusEvent } from "@shared/types";
import { noteSyncSince, syncStart } from "./system/stallWatch.js";

/** コア内の変更をクライアント（SSE）へ配信するためのイベントバス */
export class Bus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // 接続中のクライアント数ぶん購読が増えるため上限を外す
    this.emitter.setMaxListeners(0);
  }

  publish(event: BusEvent) {
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
