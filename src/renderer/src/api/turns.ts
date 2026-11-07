import type { Attachment, Chat, ChatOptionsPatch, ChildChatBody, FileRewindResult, HandoffBody, HandoffResult, HandoffVia, MessageMarks, QueuedMessage, SendMessageBody, SubagentChildBody, TellResult } from "@shared/types";
import { request } from "./http";

/** チャットの実行（続きを送る・止めずに伝える・止める・圧縮・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し。コアの routes/turns.ts） */
export const turnsApi = {
  /** 圧縮が終わるまで預かった指示を、送らずに外す（圧縮中に誤って送ったとき。外した指示を返す） */
  removeAfterCompact: (chatId: number, messageId: string) => request<QueuedMessage>("DELETE", `/api/chats/${chatId}/after-compact/${encodeURIComponent(messageId)}`),
  /**
   * pauseAfter: 質問として送る（この作業が終わったら、送信待ちを自動で送らずに一時停止する）。
   * marks: 発言の印（親への依頼文の頼み・子チャットから渡した依頼。記録の発言に残る）
   */
  sendMessage: (chatId: number, text: string, options: ChatOptionsPatch, attachments: Attachment[] = [], pauseAfter = false, marks: MessageMarks = {}) =>
    request<Chat>("POST", `/api/chats/${chatId}/messages`, { text, options, attachments, ...(pauseAfter ? { pause_after: true } : {}), ...marks } satisfies SendMessageBody),
  /**
   * 止めずに伝える（作業中なら、いまのやり取りに発言を足す。足せなければ待ちの列へ。作業中でなければすぐ送る）。
   * result: told = 足した / queued = 待ちの列に入れた / sent = すぐ送った / held = 圧縮中なので預かった。pauseAfter・marks は sendMessage と同じ
   */
  tellChat: (chatId: number, text: string, options: ChatOptionsPatch, attachments: Attachment[] = [], pauseAfter = false, marks: MessageMarks = {}) =>
    request<TellResult>("POST", `/api/chats/${chatId}/tell`, { text, options, attachments, ...(pauseAfter ? { pause_after: true } : {}), ...marks } satisfies SendMessageBody),
  cancelChat: (chatId: number) => request<void>("POST", `/api/chats/${chatId}/cancel`),
  /**
   * 会話を要約して、コンテキストを空ける（作業中なら予約: 送信待ちのいちばん上に「会話を圧縮」の行を入れ、
   * いまのやり取りが終わったらすぐ圧縮する。予約をやめるのは、その行を送信待ちから消す）
   */
  compactChat: (chatId: number) => request<Chat>("POST", `/api/chats/${chatId}/compact`),
  /** 通信が切れて止まったチャットを、つながったら自動で再開するのをやめる */
  stopReconnect: (chatId: number) => request<void>("DELETE", `/api/chats/${chatId}/reconnect`),
  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド） */
  stopBackgroundTask: (chatId: number, taskId: string) => request<void>("POST", `/api/chats/${chatId}/background/${encodeURIComponent(taskId)}/stop`),
  /** 作業の終わり（result イベント）の時点から、新しいチャットに分岐する */
  forkChat: (chatId: number, eventId: number) => request<Chat>("POST", `/api/chats/${chatId}/fork`, { event_id: eventId }),
  /** 子チャットで聞く（親の作業中でも始められる。inherit なら親の会話を引き継ぐ） */
  createChildChat: (chatId: number, body: ChildChatBody) => request<Chat>("POST", `/api/chats/${chatId}/children`, body),
  /**
   * 子チャットの作業（作業の終わりの記録 turnEventId）の最後の返答を、直接の親チャットに渡す（via: composer = 入れる文を返して記録するだけ。入れるのは画面 /
   * send = 今すぐ送る（親が作業中なら伝える）/ queue = 親の送信待ちの最後に足す）。子には渡したことの記録が残る
   */
  handOff: (chatId: number, via: HandoffVia, turnEventId: number) =>
    request<HandoffResult>("POST", `/api/chats/${chatId}/handoff`, { via, turn_event_id: turnEventId } satisfies HandoffBody),
  /** サブエージェントに子チャットで聞く（サブエージェントの会話の記録を添付にして、このチャットの子チャットを作って送る） */
  askSubagentInChild: (chatId: number, agentId: string, body: SubagentChildBody) =>
    request<Chat>("POST", `/api/chats/${chatId}/subagents/${encodeURIComponent(agentId)}/children`, body),
  /** 自分の発言（user イベント）の手前まで巻き戻して、書き直した文で送り直す（添付は元の発言のもの。restoreFiles ならファイルも戻す） */
  rewindChat: (chatId: number, eventId: number, text: string, options: ChatOptionsPatch = {}, restoreFiles = false) =>
    request<Chat>("POST", `/api/chats/${chatId}/rewind`, { event_id: eventId, text, options, restore_files: restoreFiles }),
  /** ファイルだけを、自分の発言を送る前の状態に戻す（dryRun なら戻さずに、変わる量だけ） */
  rewindFiles: (chatId: number, eventId: number, dryRun: boolean) =>
    request<FileRewindResult>("POST", `/api/chats/${chatId}/rewind-files`, { event_id: eventId, dry_run: dryRun }),
};
