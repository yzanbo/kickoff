import { EventEmitter } from "node:events";
import type { BusEvent } from "./types.js";

/** コア内の変更をクライアント（SSE）へ配信するためのイベントバス */
export class Bus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // 接続中のクライアント数ぶん購読が増えるため上限を外す
    this.emitter.setMaxListeners(0);
  }

  publish(event: BusEvent) {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: BusEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
