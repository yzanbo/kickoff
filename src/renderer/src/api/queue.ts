import type { Attachment, ChatOptionsPatch, QueueAddResult, QueueMergeResult, QueueMessageBody, QueueState } from "@shared/types";
import { request } from "./http";

const queuePath = (chatId: number, path = "") => `/api/chats/${chatId}/queue${path}`;

/**
 * 作業中に送る次の指示の待ちの列（送信待ち。コアの routes/queue.ts）。応答はどれも、変えたあとの送信待ち（QueueState）。
 * id は送信待ちの指示の ID
 */
export const queueApi = {
  /** 作業中なら送信待ちに入れる（作業中でなければすぐ送る。hold なら作業していなくても列の最後に足す） */
  queueMessage: (chatId: number, text: string, options: ChatOptionsPatch, attachments: Attachment[] = [], hold = false) =>
    request<QueueAddResult>("POST", queuePath(chatId), { text, options, attachments, ...(hold ? { hold } : {}) } satisfies QueueMessageBody),
  /** attachments: 添付を置き換える（省けば今のまま） */
  editQueued: (chatId: number, id: string, text: string, attachments?: Attachment[]) =>
    request<QueueState>("PATCH", queuePath(chatId, `/${id}`), attachments ? { text, attachments } : { text }),
  removeQueued: (chatId: number, id: string) => request<QueueState>("DELETE", queuePath(chatId, `/${id}`)),
  /** index は移したあとの位置 */
  moveQueued: (chatId: number, id: string, index: number) => request<QueueState>("POST", queuePath(chatId, `/${id}/move`), { index }),
  /** 待ちの列を、終わっても自動で送らずに止めておくか（戻すと、作業中でなければ先頭をすぐ送る） */
  setQueuePaused: (chatId: number, paused: boolean) => request<QueueState>("PUT", queuePath(chatId, "/paused"), { paused }),
  /** その指示のすぐあとに一時停止の印を付ける・外す（右クリックの「この指示のあとで止める」。id が null ならすべて外す） */
  setQueueStopAfter: (chatId: number, id: string | null, stop = true) => request<QueueState>("PUT", queuePath(chatId, "/stop-after"), { id, stop }),
  /** 印の位置をまとめて置き換える（印のドラッグ・×。0 = 1 件目の上、n = n 件目のあと） */
  setQueueStops: (chatId: number, stops: number[]) => request<QueueState>("PUT", queuePath(chatId, "/stops"), { stops }),
  /** 画面でいま書き直している待ちの指示（丸ごと置き換え。空なら外す）。次に送る指示なら、書き直しが終わるまで送らない */
  setQueueEditing: (chatId: number, ids: string[]) => request<QueueState>("PUT", queuePath(chatId, "/editing"), { ids }),
  /** 待ちの指示をすべて消す */
  clearQueued: (chatId: number) => request<QueueState>("DELETE", queuePath(chatId)),
  /** 待ちの指示をすべて（ids を渡せば選んだものだけ）1 つにまとめて、すぐ送る（作業中なら止めずに、いまのやり取りに伝える） */
  sendAllQueued: (chatId: number, ids?: string[]) => request<QueueState>("POST", queuePath(chatId, "/send-all"), ids ? { ids } : {}),
  /** 選んだ待ちの指示を、送らずに 1 件にまとめる（2 件以上） */
  mergeQueued: (chatId: number, ids: string[]) => request<QueueMergeResult>("POST", queuePath(chatId, "/merge"), { ids }),
  /** 待ちの指示をすべて、1 件ずつ別々の発言として順に送る（止めておくのをやめ、印を外す） */
  sendQueuedInOrder: (chatId: number) => request<QueueState>("POST", queuePath(chatId, "/send-in-order")),
  /** 選んだ待ちの指示をまとめて消す */
  removeQueuedMany: (chatId: number, ids: string[]) => request<QueueState>("POST", queuePath(chatId, "/remove-many"), { ids }),
  /**
   * 選んだ待ちの指示を、並びを保ったまままとめて移す（いちばん上・いちばん下、または { before: その指示の前（null ならいちばん下）,
   * belowStop: その位置に止める線があれば線の下に入れるか }）
   */
  moveQueuedMany: (chatId: number, ids: string[], to: "top" | "bottom" | { before: string | null; belowStop?: boolean }) =>
    request<QueueState>(
      "POST",
      queuePath(chatId, "/move-many"),
      typeof to === "string" ? { ids, to } : { ids, before: to.before, ...(to.belowStop === undefined ? {} : { below_stop: to.belowStop }) },
    ),
  /** 待ちの 1 件をすぐ送る（作業中なら止めずに、いまのやり取りに伝える） */
  sendQueuedNow: (chatId: number, id: string) => request<QueueState>("POST", queuePath(chatId, `/${id}/send`)),
};
