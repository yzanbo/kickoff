// 作業中の様子（ChatLive）のうち圧縮まわりの読み方（「いま」を預かる間・作業中の行とメーターの文・予約・いまの作業のあとの圧縮）
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { ChatLive, QueueState } from "@shared/chat/chatLive";
import type { QueuedMessage } from "@shared/chat/types";

/**
 * 「いま」をコアが預かる間（awaiting = 圧縮前指示を送ってから圧縮が始まるまで。圧縮前指示の作業中 / compacting = 会話の圧縮中 /
 * post = 圧縮したやり取りの続き。圧縮後指示があればその作業、なければ圧縮のあとの続きの作業が終わるまで）。
 * この間に「いま」で送った指示は、圧縮のあとのやり取りが終わってから送る（ChatLive の now）。「あとで」はいつもどおり送信待ち
 */
export type CompactHold = "compacting" | "awaiting" | "post" | null;

/** 作業中の段階から、「いま」を預かる間か */
export function compactHoldOf(live: Pick<ChatLive, "phase" | "compaction">): CompactHold {
  if (live.phase === "compacting") return "compacting";
  // 圧縮が済んだあと（手で圧縮する実行の終わりまでは段階が awaiting_compact のまま）は、圧縮のあとのやり取りとして案内する
  if (live.phase === "compacted" || live.compaction.done) return "post";
  return live.phase === "awaiting_compact" ? "awaiting" : null;
}

/** 「いま」を預かる間に「いま」を選んでいるときのチャット欄の案内と送信ボタンの名前（送ると、コアが預かって圧縮のあとのやり取りが終わってから送る） */
export const HOLD_TEXTS: Record<NonNullable<CompactHold>, { placeholder: string; sendLabel: string }> = {
  awaiting: {
    placeholder: "圧縮前指示の作業中です。Enter で送ると、このあとの圧縮後指示（なければ圧縮のあとの続き）のやり取りが終わってから送ります（⌘⇧Enter であとで送る）",
    sendLabel: "圧縮のあとのやり取りが終わったら送る",
  },
  compacting: {
    placeholder: "会話を圧縮しています。Enter で送ると、圧縮後指示（なければ圧縮のあとの続き）のやり取りが終わってから送ります（⌘⇧Enter であとで送る）",
    sendLabel: "圧縮のあとのやり取りが終わったら送る",
  },
  post: {
    placeholder: "圧縮のあとのやり取りの途中です。Enter で送ると、このやり取りが終わってから送ります（⌘⇧Enter であとで送る）",
    sendLabel: "このやり取りが終わったら送る",
  },
};

/** 圧縮中の文（作業中の行・圧縮中の行・メーターで同じ） */
export const compactingLabel = (trigger: CompactTrigger) => (trigger === "auto" ? "会話を自動で圧縮しています" : "会話を圧縮しています");

/** 作業中に手で頼んだ圧縮を、いまの作業が終わったら行うか（チャット欄のメーターの「いまの作業が終わったら圧縮します」） */
export const compactsAfterTurn = (live: Pick<ChatLive, "compaction">): boolean => live.compaction.after_turn;

/** 作業の終わりにすぐ行う圧縮・消去の行（コアの予約 reserved。送信待ちのいちばん上の行。なければ null） */
export function reservedRow(queue: QueueState): QueuedMessage | null {
  return queue.reserved ? (queue.messages[0] ?? null) : null;
}
