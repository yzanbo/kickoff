// DB クライアントの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const databaseEvents = {
  /** DB の接続の一覧が変わった（中身は送らない。端末には届けない） */
  db_connections: event<{ project_id: number }>(),
  /** DB の接続につないだ・切れた（木・テーブル・SQL のタブの接続が 1 つでも開いているか。DB タブの左の一覧の印） */
  db_connection_state: event<{ project_id: number; connection_id: number; connected: boolean }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof databaseEvents> {}
}
