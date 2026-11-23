// チャット欄の外の画像の取り決め（受け口は src/features/remoteImages/core/routes/chatImages.ts）。どれも端末には開かない
import { blob, route, type Contract } from "@shared/foundation/contract";
import type { ChatImageHost } from "@shared/chat/types";

/** 許可したホストの一覧（変えたあとも同じ形） */
export interface ImageHostsReply {
  hosts: ChatImageHost[];
}

export const remoteImagesContract = {
  /** そのチャットで表示を許可したホスト（許可した順） */
  "GET /api/chats/:chatId/image-hosts": route<never, ImageHostsReply>(),
  /** ホストの表示を許可する */
  "PUT /api/chats/:chatId/image-hosts": route<{ host: string }, ImageHostsReply>(),
  /** 許可を外す（そのホストの覚えた画像も消える） */
  "DELETE /api/chats/:chatId/image-hosts": route<never, ImageHostsReply, { host: string }>(),
  /** 許可したホストの画像（コアが代わりに取る。2 回目からは覚えた画像） */
  "GET /api/chats/:chatId/remote-image": blob<{ url: string }>(),
} as const satisfies Contract;
