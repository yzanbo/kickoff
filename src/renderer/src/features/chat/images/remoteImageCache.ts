// 許可したホストの画像を、画面で使う URL（blob:）にして覚える（流れの窓で行が外れて戻っても読み直さない）。コアもディスクに覚えているので、捨てても取り直しは手元から
import { api } from "@/api";

/** 覚える画像の数（超えたら、いちばん長く使っていないものから捨てる） */
const LIMIT = 300;

interface Held {
  host: string;
  url: Promise<string>;
}

const held = new Map<string, Held>();
const keyOf = (chatId: number, url: string) => `${chatId}\n${url}`;

function release(key: string) {
  const h = held.get(key);
  if (!h) return;
  held.delete(key);
  void h.url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
}

/** 許可したホストの画像を blob: の URL で（同じ画像は 1 回だけ読む。読めなければ覚えずに失敗を返す） */
export function loadRemoteImage(chatId: number, host: string, url: string): Promise<string> {
  const key = keyOf(chatId, url);
  const hit = held.get(key);
  if (hit) {
    held.delete(key);
    held.set(key, hit);
    return hit.url;
  }
  const pending = api.remoteImage(chatId, url).then((blob) => URL.createObjectURL(blob));
  held.set(key, { host, url: pending });
  pending.catch(() => held.get(key)?.url === pending && held.delete(key));
  while (held.size > LIMIT) release(held.keys().next().value!);
  return pending;
}

/** 許可を外したホストの画像を捨てる */
export function forgetRemoteImages(chatId: number, host: string): void {
  for (const [key, h] of [...held]) if (h.host === host && key.startsWith(`${chatId}\n`)) release(key);
}
