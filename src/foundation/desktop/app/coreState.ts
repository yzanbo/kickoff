// コアのプロセスの様子の移り変わり（Electron に依らない純粋関数）:
// starting → ready ⇄ unresponsive、落ちたら restarting → ready（作り直せた）/ failed（続けて落ちた）
import type { CoreState } from "@shared/foundation/ipc";

/** 様子を変えるできごと */
export type CoreStateEvent =
  /** 起動・作り直しが済んだ（ready を受けた） */
  | "ready"
  /** 見張りの ping に答えた（応答しないから戻る） */
  | "responded"
  /** 見張りの ping に決めた長さ答えない（応答しないにする） */
  | "silent"
  /** 利用者が「待つ」を選んだ（もう一度待ち直す） */
  | "waited"
  /** 落ちて作り直す・利用者が起動し直す */
  | "restarting"
  /** 続けて落ちたので作り直さない */
  | "gaveUp";

export function coreStateAfter(state: CoreState, event: CoreStateEvent): CoreState {
  switch (event) {
    case "ready":
      return "ready";
    case "responded":
    case "waited":
      return state === "unresponsive" ? "ready" : state;
    case "silent":
      return state === "ready" ? "unresponsive" : state;
    case "restarting":
      return "restarting";
    case "gaveUp":
      return "failed";
  }
}
