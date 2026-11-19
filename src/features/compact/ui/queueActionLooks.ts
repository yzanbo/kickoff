import { Eraser, Shrink, type LucideIcon } from "lucide-react";
import type { QueueAction } from "@shared/types";

/** 送信待ちに挟む行（会話の圧縮・コンテキストの消去）の見た目と文言。行の文は @shared/types の QUEUE_ACTION_LABELS */
export interface QueueActionLook {
  icon: LucideIcon;
  /** 色を決める class（行の文・見出しのボタン） */
  tone: string;
  /** 見出しの「挟む」のボタンの文字（短く） */
  button: string;
  /** 見出しのボタンの説明（押すと何が足されるか） */
  addTitle: string;
  /** 行の文に乗せたときの説明（そこまで送ったら何が起きるか） */
  rowTitle: string;
  /** 行の右クリックの「このあとで…」と、その説明 */
  after: string;
  afterTitle: string;
  /** 行の送るボタン（作業中 / 作業していないとき） */
  sendBusy: string;
  sendIdle: string;
}

export const QUEUE_ACTION_LOOKS: Record<QueueAction, QueueActionLook> = {
  compact: {
    icon: Shrink,
    tone: "queued-action-compact",
    button: "圧縮",
    addTitle:
      "「会話を圧縮」を送信待ちのいちばん下に足します。そこまで送ったら、これまでの会話を要約してコンテキストを空けます。行をドラッグ・↑↓ で、圧縮したい位置へ動かせます（行の右クリックの「このあとで会話を圧縮」でも足せます）",
    rowTitle: "ここまで送ったら、これまでの会話を要約してコンテキストを空けます（Claude Code の /compact）",
    after: "このあとで会話を圧縮",
    afterTitle:
      "この指示のすぐあとに「会話を圧縮」を挟みます。この指示の作業が終わったら、次を送る前に会話を要約してコンテキストを空けます（すぐあとに一時停止があれば、止まる前に圧縮します）",
    sendBusy: "このやり取りのあとですぐ圧縮",
    sendIdle: "いますぐ圧縮",
  },
  clear: {
    icon: Eraser,
    tone: "queued-action-clear",
    button: "コンテキスト消去",
    addTitle:
      "「コンテキストを消去」を送信待ちのいちばん下に足します。そこまで送ったら、これまでの会話を AI に引き継がず、次の指示から新しい会話で始めます（記録は残ります）。行をドラッグ・↑↓ で、消去したい位置へ動かせます（行の右クリックの「このあとでコンテキストを消去」でも足せます）",
    rowTitle: "ここまで送ったら、これまでの会話を AI に引き継がず、次の指示から新しい会話で始めます（Claude Code の /clear と同じ。このチャットの記録は残ります）",
    after: "このあとでコンテキストを消去",
    afterTitle:
      "この指示のすぐあとに「コンテキストを消去」を挟みます。この指示の作業が終わったら、次の指示は新しい会話で始めます（すぐあとに一時停止があれば、止まる前に消去します）",
    sendBusy: "このやり取りのあとですぐ消去",
    sendIdle: "いますぐ消去",
  },
};
