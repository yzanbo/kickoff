import type { Chat, ChatOptionsPatch, Attachment, FileRewindResult, MessageBody, TellResult } from "@shared/types";
import { request } from "./http";

/** チャットの実行（続きを送る・止めずに伝える・止める・圧縮・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し。コアの routes/turns.ts） */
export const turnsApi = {
  sendMessage: (chatId: number, text: string, options: ChatOptionsPatch, attachments: Attachment[] = []) =>
    request<Chat>("POST", `/api/chats/${chatId}/messages`, { text, options, attachments } satisfies MessageBody),
  /**
   * 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る）。
   * result: told = 足した / queued = 待ちの列に入れた / sent = すぐ送った
   */
  tellChat: (chatId: number, text: string, options: ChatOptionsPatch, attachments: Attachment[] = []) =>
    request<TellResult>("POST", `/api/chats/${chatId}/tell`, { text, options, attachments } satisfies MessageBody),
  cancelChat: (chatId: number) => request<void>("POST", `/api/chats/${chatId}/cancel`),
  /** 会話を要約して、コンテキストを空ける */
  compactChat: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/compact`),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる */
  stopReconnect: (chatId: number) => request<void>("DELETE", `/api/chats/${chatId}/reconnect`),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopBackgroundTask: (chatId: number, taskId: string) => request<void>("POST", `/api/chats/${chatId}/background/${encodeURIComponent(taskId)}/stop`),
  /** 作業の終わり（result イベント）の時点から、新しいチャットに分岐する */
  forkChat: (chatId: number, eventId: number) => request<Chat>("POST", `/api/chats/${chatId}/fork`, { event_id: eventId }),
  /** 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restoreFiles ならファイルも戻す） */
  rewindChat: (chatId: number, eventId: number, text: string, options: ChatOptionsPatch = {}, restoreFiles = false) =>
    request<Chat>("POST", `/api/chats/${chatId}/rewind`, { event_id: eventId, text, options, restore_files: restoreFiles }),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけ） */
  rewindFiles: (chatId: number, eventId: number, dryRun: boolean) =>
    request<FileRewindResult>("POST", `/api/chats/${chatId}/rewind-files`, { event_id: eventId, dry_run: dryRun }),
};
