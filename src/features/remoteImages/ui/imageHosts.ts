// 外の画像の表示を許可したホスト（チャットごと・ノートごと。コアの DB に覚え、変わったら知らせ chat_image_hosts・note_image_hosts で入れ替える）
import { useMemo } from "react";
import type { ChatImageHost } from "@shared/chat/types";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { deleteHost, fetchHosts, putHost, scopeKey, scopeOfKey, type ImageScope } from "./imageScope";
import { forgetRemoteImages } from "./remoteImageCache";

const imageHostsStore = createKeyedStore<string, ChatImageHost[]>({
  load: (key) => fetchHosts(scopeOfKey(key)),
  reduce: {
    chat_image_hosts: (data, event, key) => (key === `chat:${event.chat_id}` ? event.hosts : data),
    note_image_hosts: (data, event, key) => (key === `note:${event.project_id}:${event.path}` ? event.hosts : data),
  },
  dropOn: { chat_deleted: (event) => `chat:${event.id}` },
});

const NONE: ChatImageHost[] = [];

/** その範囲で表示を許可したホストの集まり（届くまでは空） */
export function useAllowedHosts(scope: ImageScope): ReadonlySet<string> {
  const hosts = useKeyedStore(imageHostsStore, scopeKey(scope)).data ?? NONE;
  return useMemo(() => new Set(hosts.map((h) => h.host)), [hosts]);
}

/** ホストの表示を許可する（押した「host から画像を n 件表示」） */
export async function allowImageHost(scope: ImageScope, host: string): Promise<void> {
  imageHostsStore.set(scopeKey(scope), await putHost(scope, host));
}

/** 許可を外す（そのホストの画像は出さなくなり、コアの覚えも消える） */
export async function revokeImageHost(scope: ImageScope, host: string): Promise<void> {
  imageHostsStore.set(scopeKey(scope), await deleteHost(scope, host));
  forgetRemoteImages(scope, host);
}
