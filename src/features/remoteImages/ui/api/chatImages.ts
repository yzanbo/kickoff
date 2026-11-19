import type { ChatImageHost } from "@shared/types";
import { request, requestBlob, withQuery } from "@/foundation/ui/api/http";

/** チャット欄の外の画像（表示を許可したホストと、許可したホストの画像）。コアの routes/chatImages.ts */
export const chatImagesApi = {
  /** そのチャットで表示を許可したホスト */
  imageHosts: (chatId: number) => request<{ hosts: ChatImageHost[] }>("GET", `/api/chats/${chatId}/image-hosts`).then((r) => r.hosts),
  /** ホストの表示を許可する（変えたあとの一覧） */
  allowImageHost: (chatId: number, host: string) => request<{ hosts: ChatImageHost[] }>("PUT", `/api/chats/${chatId}/image-hosts`, { host }).then((r) => r.hosts),
  /** 許可を外す（覚えた画像も消える。変えたあとの一覧） */
  revokeImageHost: (chatId: number, host: string) => request<{ hosts: ChatImageHost[] }>("DELETE", withQuery(`/api/chats/${chatId}/image-hosts`, { host })).then((r) => r.hosts),
  /** 許可したホストの画像（コアが代わりに取る） */
  remoteImage: (chatId: number, url: string) => requestBlob(withQuery(`/api/chats/${chatId}/remote-image`, { url })).then((r) => r.blob),
};
