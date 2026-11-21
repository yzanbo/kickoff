// 圧縮の取り決め（圧縮・消去と、圧縮が終わるまで預かった指示）。受け口は src/features/compact/core/routes.ts
import { empty, route, type Contract } from "@shared/foundation/contract";
import type { Attachment, Chat, QueuedMessage } from "@shared/chat/types";

export const compactContract = {
  /** 圧縮が終わるまで預かった指示を、送らずに外す（もう伝えたなら 404、伝えている途中なら 409）。外した指示 */
  "DELETE /api/chats/:chatId/after-compact/:messageId": route<never, QueuedMessage>({ access: "device" }),
  /** 画面でいま書き直している預かった指示（丸ごと置き換え、空なら外す。持ち時間より短い間隔で知らせ直す） */
  "PUT /api/chats/:chatId/after-compact/editing": empty<{ ids: string[] }>({ access: "device" }),
  /** 預かった指示をその場で書き直す（もう伝えたなら 404）。書き直した指示 */
  "PATCH /api/chats/:chatId/after-compact/:messageId": route<{ text: string; attachments: Attachment[] }, QueuedMessage>({ access: "device" }),
  /** 会話を要約してコンテキストを空ける（作業中なら送信待ちのいちばん上に予約。まだ会話がなければ 409） */
  "POST /api/chats/:chatId/compact": route<never, Chat>({ access: "device" }),
  /** コンテキストの消去（作業中なら、いまのやり取りが終わったらすぐ消去する予約） */
  "POST /api/chats/:chatId/clear": route<never, Chat>({ access: "device" }),
} as const satisfies Contract;
