// 送信待ちの、指示の代わりに挟む行（会話の圧縮・コンテキストの消去）の見分け
import type { QueueAction, QueuedMessage } from "@shared/types";

/** 指示の代わりに挟む行ならその種類（ふつうの指示なら null） */
export function queueActionOf(m: QueuedMessage): QueueAction | null {
  if (m.compact) return "compact";
  if (m.clear) return "clear";
  return null;
}

/** 指示の代わりに挟む行か（書き直せず、まとめる・まとめて送るでは除いて列に残す） */
export function isQueueAction(m: QueuedMessage): boolean {
  return queueActionOf(m) !== null;
}

/**
 * チャット欄に打った /clear か（添付なし・前後の空白は除く）。Claude Code にはそのまま送らず、送信待ちの「コンテキスト消去」と同じ処理にする
 * （Claude Code に送ると会話は空になるが、Kickoff の記録に区切り context_cleared が残らず、画面では会話が続いて見えるのに AI は前を覚えていない、とずれたため）
 */
export function isClearCommand(text: string, attachments: readonly unknown[] = []): boolean {
  return attachments.length === 0 && /^\/clear\s*$/.test(text.trim());
}

/** / の候補に出す /clear の説明（Kickoff での動き。Claude Code の説明を置き換える） */
export const CLEAR_COMMAND_DESCRIPTION = "コンテキストを消去して、次の指示から新しい会話で始める（記録は残り、区切りの線が入る）";
