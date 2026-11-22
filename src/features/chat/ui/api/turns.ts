import type { FileRewindResult } from "@shared/ai/types";
import type { ChatEventOf } from "@shared/chat/chatEvent";
import type { Attachment, Chat, ChatOptionsPatch, MessageBody, QueuedMessage } from "@shared/chat/types";
import type { SendBody, SendResult } from "@shared/chat/send";
import type { ProviderHandoffStatus, ProviderSwitchPreview, ProviderSwitchResult } from "@shared/providerSwitch/types";
import type { ProviderId } from "@shared/settings/types";
import { withSendExtras } from "@/features/chat/ui/send/sendExtras";
import { request } from "@/foundation/ui/api/http";

/** チャットの実行（続きを送る・止めずに伝える・止める・圧縮・自動の再開をやめる・裏の作業を止める・分岐・巻き戻し。コアの routes/turns.ts） */
export const turnsApi = {
  providerSwitchPreview: (chatId: number, target: ProviderId) => request<ProviderSwitchPreview>("GET", `/api/chats/${chatId}/provider-switch?target=${encodeURIComponent(target)}`),
  switchProvider: (chatId: number, target: ProviderId, confirmation: string) => request<ProviderSwitchResult>("POST", `/api/chats/${chatId}/provider-switch`, { target, confirmation }),
  providerHandoff: (chatId: number) => request<ProviderHandoffStatus | null>("GET", `/api/chats/${chatId}/provider-handoff`),
  providerHandoffRecord: (chatId: number, eventId: number) => request<{ event: ChatEventOf<"provider_switched">; pending: Pick<ProviderHandoffStatus, "state" | "error"> | null }>("GET", `/api/chats/${chatId}/provider-handoff/${eventId}`),
  retryProviderHandoff: (chatId: number, eventId: number) => request<{ warning: string | null }>("POST", `/api/chats/${chatId}/provider-handoff/retry`, { event_id: eventId }),
  confirmResendProviderHandoff: (chatId: number, eventId: number) => request<{ warning: string | null }>("POST", `/api/chats/${chatId}/provider-handoff/confirm-resend`, { event_id: eventId, confirm_duplicate_risk: true }),
  /** 圧縮のあとのやり取りが終わるまで預かった指示を、送らずに外す（圧縮中に誤って送ったとき。外した指示を返す） */
  removeAfterCompact: (chatId: number, messageId: string) => request<QueuedMessage>("DELETE", `/api/chats/${chatId}/after-compact/${encodeURIComponent(messageId)}`),
  /** 預かった指示をその場で書き直す（送る順はそのまま。書き直し中の印も外れる。書き直した指示を返す。もう伝えたなら 404） */
  updateAfterCompact: (chatId: number, messageId: string, text: string, attachments: Attachment[]) =>
    request<QueuedMessage>("PATCH", `/api/chats/${chatId}/after-compact/${encodeURIComponent(messageId)}`, { text, attachments }),
  /** 入力欄で書き直している預かった指示を知らせる（丸ごと置き換え、空なら外す。書き直している間は、その指示から後ろを送らない。開いている間は知らせ直す） */
  setAfterCompactEditing: (chatId: number, ids: string[]) => request<void>("PUT", `/api/chats/${chatId}/after-compact/editing`, { ids }),
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
  /** AI が予約した作業場所の移動を取り消す */
  cancelWorkplaceMove: (chatId: number) => request<void>("DELETE", `/api/chats/${chatId}/workplace-move`),
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
