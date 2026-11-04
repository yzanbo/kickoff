// 返答の一部を選んでコメントするときの、チャット欄に添える文（純粋関数）
import type { Attachment } from "../../../../core/types";

/** 引用する文の長さの上限（長すぎる選択は頭だけにする） */
const MAX_QUOTE = 1500;

/**
 * 選んだ文を Markdown の引用にし、コメントを添える（「> 選んだ文」の下にコメント）。
 * 行頭・行末の空白と、続く空行は詰める。コメントが空なら引用だけ
 */
export function quoteComment(selection: string, comment: string): string {
  let text = selection.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_QUOTE) text = `${text.slice(0, MAX_QUOTE)}…`;
  const quote = text
    .split("\n")
    .map((line) => (line.trim() ? `> ${line.trim()}` : ">"))
    .join("\n");
  const note = comment.trim();
  return note ? `${quote}\n\n${note}` : quote;
}

/**
 * 外から入力欄に文を入れる（Composer の fillRef。append: 書いている文の後ろに空行を挟んで足す。なければ置き換える。
 * attachments: アップロード済みの添付も足す。focus: false なら入力欄にピントを移さない（隠れているタブに書きかけを戻すとき））
 */
export type ComposerFill = (text: string, opts?: { append?: boolean; attachments?: Attachment[]; focus?: boolean }) => void;

/** チャット欄の文の後ろに足す（書いている文があれば空行を挟む） */
export function appendBlock(current: string, block: string): string {
  const head = current.replace(/\s+$/, "");
  return head ? `${head}\n\n${block}` : block;
}
