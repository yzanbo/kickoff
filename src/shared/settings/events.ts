// 設定の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { AppSettings } from "./types";

export const settingsEvents = {
  settings: event<{ settings: AppSettings }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof settingsEvents> {}
}
