// 圧縮の取り決め（圧縮・消去。預かった指示を外す・書き直すのは送信待ちの口の命令）。受け口は src/features/compact/core/routes.ts
import { route, type Contract } from "@shared/foundation/contract";
import type { Chat } from "@shared/chat/types";

export const compactContract = {
  /** 会話を要約してコンテキストを空ける（作業中なら送信待ちのいちばん上に予約。まだ会話がなければ 409） */
  "POST /api/chats/:chatId/compact": route<never, Chat>({ access: "device" }),
  /** コンテキストの消去（作業中なら、いまのやり取りが終わったらすぐ消去する予約） */
  "POST /api/chats/:chatId/clear": route<never, Chat>({ access: "device" }),
} as const satisfies Contract;
