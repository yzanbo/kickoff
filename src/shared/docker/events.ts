// Docker の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const dockerEvents = {
  /** Docker タブ: そのプロジェクトのコンテナ・操作の様子が変わった（受けた画面は一覧を取り直す） */
  docker_changed: event<{ project_id: number }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof dockerEvents> {}
}
