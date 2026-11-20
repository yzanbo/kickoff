// 通知の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";

export const notificationEvents = {
  /** AI からの知らせ（AI の notify_user。通知の中心が、そのチャットを見ていない人に Mac の通知・プッシュを送る。端末の SSE には届けない） */
  ai_notice: event<{ project_id: number; chat_id: number; message: string }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof notificationEvents> {}
}
