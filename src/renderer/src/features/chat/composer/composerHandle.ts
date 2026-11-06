import type { Attachment } from "@shared/types";

/**
 * 外から入力欄に文を入れる（append: 書いている文の後ろに空行を挟んで足す。なければ置き換える。
 * attachments: アップロード済みの添付も足す。focus: false なら入力欄にピントを移さない（隠れているタブに書きかけを戻すとき））
 */
export type ComposerFill = (text: string, opts?: { append?: boolean; attachments?: Attachment[]; focus?: boolean }) => void;

/** 外からチャット欄を動かす口（Composer の handleRef。発言の一覧の「入力欄に入れる」・選んだ範囲へのコメント・検索をやめたあとなど） */
export interface ComposerHandle {
  /** 文を入れる（入れたら文の終わりにピントを置く） */
  fill: ComposerFill;
  /** 文をキャレットの位置に入れる（選んでいればその範囲と置き換える。書いている文は残す。入れたらその後ろにキャレットを置く。定型文の帯から） */
  insert: (text: string) => void;
  /** 入力欄にピントを移す */
  focus: () => void;
}
