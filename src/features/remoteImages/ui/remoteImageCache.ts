// 許可したホストの画像を、画面で使う URL（blob:）にして覚える（流れの窓で行が外れて戻っても読み直さない）。コアもディスクに覚えているので、捨てても取り直しは手元から
import { remoteImagesApi } from "./api";
import { createLruMap } from "@/foundation/ui/lib/lruMap";

/** 覚える画像の数（超えたら、いちばん長く使っていないものから捨てる） */
const LIMIT = 300;

interface Held {
  host: string;
  url: Promise<string>;
}

const revoke = (h: Held) => void h.url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
const held = createLruMap<string, Held>(LIMIT, undefined, { onEvict: revoke });
const keyOf = (chatId: number, url: string) => `${chatId}\n${url}`;

/** 許可したホストの画像を blob: の URL で（同じ画像は 1 回だけ読む。読めなければ覚えずに失敗を返す） */
export function loadRemoteImage(chatId: number, host: string, url: string): Promise<string> {
  const key = keyOf(chatId, url);
  const hit = held.get(key);
  if (hit) return hit.url;
  const pending = remoteImagesApi("GET /api/chats/:chatId/remote-image", { params: { chatId }, query: { url } }).then((r) => URL.createObjectURL(r.blob));
  held.set(key, { host, url: pending });
  pending.catch(() => held.peek(key)?.url === pending && held.delete(key));
  return pending;
}

/** 許可を外したホストの画像を捨てる */
export function forgetRemoteImages(chatId: number, host: string): void {
  for (const [key, h] of held.entries()) {
    if (h.host !== host || !key.startsWith(`${chatId}\n`)) continue;
    held.delete(key);
    revoke(h);
  }
}
