// ノートの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const noteEvents = {
  /** プロジェクトのノートを作った・書いた・動かした・ゴミ箱へ移した（Kickoff の中の操作だけ。一覧と開いているノートを取り直す） */
  notes: event<{ project_id: number; path: string | null }>({ access: "device" }),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof noteEvents> {}
}
