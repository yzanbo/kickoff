// 送る口 1 本と送信待ちの口の本文・答えの形（POST /api/chats/:id/messages・POST /api/chats/:id/queue・POST /api/chats/:id/queue/send・PUT /api/chats/:id/queue/editing）。
// 前からの口（/tell・送信待ちの 1 件ごとの口・/after-compact/*）は、この口と同じ決まりを通る別名として残る（画面・スマホを乗せ替えたら消す）
import type { QueueMessageBody, TellResult } from "@shared/foundation/apiTypes";
import type { QueueState } from "./chatLive";
import type { QueueCommand } from "./queueCommand";
import type { Chat } from "./types";

/**
 * 送る（POST /api/chats/:id/messages）。when: now = 止めずに伝える（作業していなければすぐ送る）/ later = 作業中なら送信待ちに入れる
 * （作業していなければすぐ送る。hold なら送らずに列の最後）。省けば作業中は 409（前からの送る口。答えはチャット）
 */
export interface SendBody extends QueueMessageBody {
  when?: "now" | "later";
}

/** 送った結果（when を書いたとき）: sent = すぐ送った / told = いまの作業に足した / held = 預かった / queued = 送信待ちに入れた。そのあとのチャットと送信待ち */
export interface SendResult {
  result: TellResult["result"];
  chat: Chat;
  queue: QueueState;
}

/** 送信待ちを変える命令の列（POST /api/chats/:id/queue。全部通るか、1 つも変えない。答えはそのあとの送信待ち） */
export interface QueueCommandsBody {
  commands: QueueCommand[];
}

/** 送信待ちをすぐ送る（POST /api/chats/:id/queue/send。now = その 1 件 / all = まとめて 1 件にして（ids でその指示だけ）/ in_order = 1 件ずつ順に） */
export type QueueSendBody = { mode: "now"; ids: [string] } | { mode: "all"; ids?: string[] } | { mode: "in_order" };

/** 画面で書き直している行（PUT /api/chats/:id/queue/editing。丸ごと置き換え、空なら外す。lane を省けば送信待ち） */
export interface QueueEditingBody {
  lane?: "now" | "later";
  ids: string[];
}
