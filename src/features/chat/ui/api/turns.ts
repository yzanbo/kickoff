import type { FileRewindResult } from "@shared/ai/types";
import type { Chat, ChatOptionsPatch, MessageBody } from "@shared/chat/types";
import type { SendBody, SendResult } from "@shared/chat/send";
import { withSendExtras } from "@/features/chat/ui/send/sendExtras";
import { request } from "@/foundation/ui/api/http";

/** チャットの実行（続きを送る・止めずに伝える・止める・圧縮・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し。コアの routes/turns.ts） */
export const turnsApi = {
  /**
   * 送る口 1 本（POST /api/chats/:chatId/messages）。when: now = 止めずに伝える（作業していなければすぐ送る。足せなければ預かる）/
   * later = 作業中なら送信待ちに入れる（hold なら作業していなくても列の最後）。省けば続きを送る（作業中は 409。答えはチャット）。
   * pause_after は質問として送る（この作業が終わったら送信待ちを一時停止）、handoff_* は発言の印
   */
  sendMessage: (chatId: number, body: SendBody) => request<Chat | SendResult>("POST", `/api/chats/${chatId}/messages`, withSendExtras(body)),
  cancelChat: (chatId: number) => request<void>("POST", `/api/chats/${chatId}/cancel`),
  /**
   * 会話を要約して、コンテキストを空ける（作業中なら予約: 送信待ちのいちばん上に「会話を圧縮」の行を入れ、
   * いまのやり取りが終わったらすぐ圧縮する。予約をやめるのは、その行を送信待ちから消す）
   */
  compactChat: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/compact`),
  /**
   * コンテキストを消去する（次の指示から新しい会話で始める。記録は残る。作業中なら予約: 送信待ちのいちばん上に「コンテキストを消去」の行を入れ、
   * いまのやり取りが終わったらすぐ消去する。予約をやめるのは、その行を送信待ちから消す）
   */
  clearContext: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/clear`),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる */
  stopReconnect: (chatId: number) => request<void>("DELETE", `/api/chats/${chatId}/reconnect`),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopBackgroundTask: (chatId: number, taskId: string) => request<void>("POST", `/api/chats/${chatId}/background/${encodeURIComponent(taskId)}/stop`),
  /** 作業の終わり（result イベント）の時点から、新しいチャットに分岐する */
  forkChat: (chatId: number, eventId: number) => request<Chat>("POST", `/api/chats/${chatId}/fork`, { event_id: eventId }),
  /** サブエージェントに子チャットで聞く（サブエージェントの会話の記録を添付にして、このチャットの子チャットを作って送る） */
  askSubagentInChild: (chatId: number, agentId: string, body: MessageBody) =>
    request<Chat>("POST", `/api/chats/${chatId}/subagents/${encodeURIComponent(agentId)}/children`, body),
  /** 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restoreFiles ならファイルも戻す） */
  rewindChat: (chatId: number, eventId: number, text: string, options: ChatOptionsPatch = {}, restoreFiles = false) =>
    request<Chat>("POST", `/api/chats/${chatId}/rewind`, { event_id: eventId, text, options, restore_files: restoreFiles }),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけ） */
  rewindFiles: (chatId: number, eventId: number, dryRun: boolean) =>
    request<FileRewindResult>("POST", `/api/chats/${chatId}/rewind-files`, { event_id: eventId, dry_run: dryRun }),
};
