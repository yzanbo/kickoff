// チャットで外の画像の表示を許可したホスト（チャットごと。コアの DB に覚え、変わったら知らせ chat_image_hosts で入れ替える）
import { useMemo } from "react";
import type { ChatImageHost } from "@shared/chat/types";
import { remoteImagesApi } from "./api";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { forgetRemoteImages } from "./remoteImageCache";

const imageHostsStore = createKeyedStore<number, ChatImageHost[]>({
  load: (chatId) => remoteImagesApi("GET /api/chats/:chatId/image-hosts", { params: { chatId } }).then((r) => r.hosts),
  reduce: { chat_image_hosts: (data, event, chatId) => (event.chat_id === chatId ? event.hosts : data) },
  dropOn: { chat_deleted: (event) => event.id },
});

const NONE: ChatImageHost[] = [];

/** そのチャットで表示を許可したホスト（許可した順。届くまでは空） */
function useImageHosts(chatId: number): ChatImageHost[] {
  return useKeyedStore(imageHostsStore, chatId).data ?? NONE;
}

/** そのチャットで表示を許可したホストの集まり */
export function useAllowedHosts(chatId: number): ReadonlySet<string> {
  const hosts = useImageHosts(chatId);
  return useMemo(() => new Set(hosts.map((h) => h.host)), [hosts]);
}

/** ホストの表示を許可する（押した「host から画像を n 件表示」） */
export async function allowImageHost(chatId: number, host: string): Promise<void> {
  imageHostsStore.set(chatId, (await remoteImagesApi("PUT /api/chats/:chatId/image-hosts", { params: { chatId }, body: { host } })).hosts);
}

/** 許可を外す（そのホストの画像は出さなくなり、コアの覚えも消える） */
export async function revokeImageHost(chatId: number, host: string): Promise<void> {
  imageHostsStore.set(chatId, (await remoteImagesApi("DELETE /api/chats/:chatId/image-hosts", { params: { chatId }, query: { host } })).hosts);
  forgetRemoteImages(chatId, host);
}
