// 定型文の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { Snippet } from "./types";

export const snippetEvents = {
  /** 作った・変えた・並べ替えた（並べ替えはすべての定型文を 1 件ずつ）。プロジェクトを消して一緒に消えたものは project_deleted で外す */
  snippet: event<{ snippet: Snippet }>(),
  snippet_deleted: event<{ id: number }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof snippetEvents> {}
}
