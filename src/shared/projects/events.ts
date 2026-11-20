// プロジェクトの SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { Project } from "./types";

export const projectEvents = {
  project: event<{ project: Project }>({ access: "device" }),
  project_deleted: event<{ id: number }>({ access: "device" }),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof projectEvents> {}
}
