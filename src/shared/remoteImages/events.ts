// チャット欄とノートの外の画像の SSE の種類
import { event, type EventsOf, type EventTable } from "@shared/foundation/contract";
import type { ChatImageHost } from "@shared/chat/types";

export const remoteImageEvents = {
  /** チャットで外の画像の表示を許可したホストが変わった（そのチャットの分を丸ごと。端末には届けない） */
  chat_image_hosts: event<{ project_id: number; chat_id: number; hosts: ChatImageHost[] }>(),
  /** ノートで外の画像の表示を許可したホストが変わった（そのノートの分を丸ごと。path はノートのフォルダからの相対のパス。端末には届けない） */
  note_image_hosts: event<{ project_id: number; path: string; hosts: ChatImageHost[] }>(),
} as const satisfies EventTable;

declare module "@shared/foundation/contract" {
  interface ServerEventMap extends EventsOf<typeof remoteImageEvents> {}
}
