// グループの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { ChatGroup } from "./types";

export const groupEvents = {
  group: event<{ group: ChatGroup }>({ access: "device" }),
  group_deleted: event<{ id: number; project_id: number }>({ access: "device" }),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof groupEvents> {}
}
