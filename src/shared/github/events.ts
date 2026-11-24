// GitHub と CI の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { CiFailure } from "./ciTypes";

export const githubEvents = {
  /** 見張っているブランチの CI が落ちた（同じ実行は 1 回だけ。画面は設定の「通知」に合わせて Mac の通知を出し、CI のタブを取り直す） */
  ci_failed: event<{ failure: CiFailure }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof githubEvents> {}
}
