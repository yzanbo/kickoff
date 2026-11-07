import type { ChatLive } from "@shared/types";

/**
 * 「いま」をコアが預かる間（awaiting = 圧縮前指示を送ってから圧縮が始まるまで。圧縮前指示の作業中 / compacting = 会話の圧縮中 /
 * post = 圧縮したやり取りの続き。圧縮後指示があればその作業、なければ圧縮のあとの続きの作業が終わるまで）。
 * この間に「いま」で送った指示は、圧縮のあとのやり取りが終わってから送る（ChatLive の after_compact）。「あとで」はいつもどおり送信待ち
 */
export type CompactHold = "compacting" | "awaiting" | "post" | null;

/** 作業中の様子から、「いま」を預かる間か */
export function compactHoldOf(live: ChatLive): CompactHold {
  if (live.compacting !== null) return "compacting";
  // 圧縮が済んだあと（手で圧縮する実行の終わりまでは awaiting_compact も立っている）は、圧縮のあとのやり取りとして案内する
  if (live.compacted_turn) return "post";
  return live.awaiting_compact ? "awaiting" : null;
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
