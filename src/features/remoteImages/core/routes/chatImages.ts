// チャット欄の外の画像の受け口（取り決め @shared/remoteImages/contract.ts）
import { z } from "zod";
import type { Chat } from "@shared/chat/types";
import { remoteImagesContract } from "@shared/remoteImages/contract";
import type { RemoteImageService } from "@/features/remoteImages/core/service";
import { implement, type Param } from "@/foundation/core/http/implement";

const hostSchema = z.string().trim().min(1).max(300);

/**
 * チャット欄の外の画像: 表示を許可したホストの一覧・許可・取り消しと、許可したホストの画像。
 * どれも端末には開かない（取り決めに access を書かない）
 */
export function chatImageRoutes({ chatParam, remoteImages }: { chatParam: Param<Chat>; remoteImages: RemoteImageService }) {
  return implement(remoteImagesContract, {
    context: { chatId: chatParam },
    "GET /api/chats/:chatId/image-hosts": { run: ({ chatId: chat }) => ({ hosts: remoteImages.hosts(chat.id) }) },
    "PUT /api/chats/:chatId/image-hosts": {
      body: z.object({ host: hostSchema }),
      run: ({ chatId: chat, body }) => ({ hosts: remoteImages.allow(chat, body.host) }),
    },
    "DELETE /api/chats/:chatId/image-hosts": {
      query: z.object({ host: hostSchema }),
      run: async ({ chatId: chat, query }) => ({ hosts: await remoteImages.revoke(chat, query.host) }),
    },
    // ページとして開かれても何も動かないよう sandbox の CSP を付ける（fileResponse）
    "GET /api/chats/:chatId/remote-image": {
      query: z.object({ url: z.string().min(1).max(8192) }),
      run: async ({ chatId: chat, query }) => {
        const image = await remoteImages.image(chat, query.url);
        return { bytes: new Uint8Array(image.body), type: image.contentType, cache: "private, max-age=3600" };
      },
    },
  });
}
