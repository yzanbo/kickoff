// ゴミ箱の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const trashEvents = {
  /** Kickoff のゴミ箱の中身が変わった（入れた・戻した・消えた。project_id は出すプロジェクト。画面は「ゴミ箱」タブを読み直す） */
  trash: event<{ project_id: number | null }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof trashEvents> {}
}
