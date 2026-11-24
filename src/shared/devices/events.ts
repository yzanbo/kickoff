// スマホ連携の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { PairingState } from "./types";

export const deviceEvents = {
  /** スマホ連携のペアリングの様子が変わった（番号・確かめを待っている頼み。この Mac の画面だけに届ける） */
  pairing: event<{ state: PairingState }>(),
  /** つないだ端末の一覧が変わった（中身は送らない。画面は読み直す） */
  devices: event<{}>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof deviceEvents> {}
}
