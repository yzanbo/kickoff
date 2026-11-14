// Expo Push（Android のアプリへのプッシュ）。本体は端末のプッシュ用 ID 宛てに Expo の API を直接呼ぶだけで、秘密の鍵を持たない
// （Expo の「アクセストークン必須」は使わない。本体ごとに秘密を配ることになるため。2026-11-14 に利用者と決めた）。
// 文は短く（チャット名と状態）、会話の中身は載せない（Expo と Google のサーバーを通るため）。押したら本体の ID とチャットの ID で開く
import type { DevicePush } from "@shared/types";
import type { PushMessage, PushResult, PushSender } from "./center.js";

/** Expo Push の送り先 */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** 送るのを待つ時間（届かなくても、ほかの通知は止めない） */
const SEND_TIMEOUT_MS = 15_000;

/** Android の通知のチャンネル（アプリが同じ ID で作る） */
export const EXPO_CHANNEL_ID = "chats";

/** Expo に送る本文（data は押したときにアプリが読む。本体の ID と開くもの） */
export function expoPushBody(token: string, message: PushMessage) {
  return {
    to: token,
    title: message.title,
    body: message.body,
    data: { host_id: message.host_id, target: message.target },
    sound: "default",
    priority: "high",
    channelId: EXPO_CHANNEL_ID,
  };
}

/** Expo の答え（1 件分）から結果を決める。宛先がもう使えない（アプリを消した・入れ直した）なら gone */
export function expoPushResult(json: unknown): PushResult {
  const ticket = (json as { data?: { status?: string; message?: string; details?: { error?: string } }[] | { status?: string; message?: string; details?: { error?: string } } })?.data;
  const first = Array.isArray(ticket) ? ticket[0] : ticket;
  if (first?.status === "ok") return "sent";
  if (first?.details?.error === "DeviceNotRegistered") return "gone";
  throw new Error(`Expo Push が断りました: ${first?.message ?? JSON.stringify(json).slice(0, 200)}`);
}

/** Expo Push の送り手（Web Push の宛先は、まだ送らない = iPhone の Web の段で足す） */
export function expoPushSender(fetchFn: typeof fetch = fetch): PushSender {
  return {
    async send(push: DevicePush, message: PushMessage): Promise<PushResult> {
      if (push.kind !== "expo") return "skipped";
      const res = await fetchFn(EXPO_PUSH_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(expoPushBody(push.token, message)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok && !json) throw new Error(`Expo Push が ${res.status} を返しました`);
      return expoPushResult(json);
    },
  };
}
