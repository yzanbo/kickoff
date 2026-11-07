// 起動したときの送信待ちの確かめで選ぶもの（ダイアログとチャットの中の帯で共通）
import type { QueueResume, QueueResumeAction } from "@shared/types";

/** ダイアログで選ぶもの: 答え（送る / 続けてから送る / 止めておく）と、決めずに残す「あとで」 */
export type QueueResumeChoice = QueueResumeAction | "later";

/** 選んでいないときの答え: 作業の途中で止まったチャットは続けてから送る、ほかは送る */
export const defaultResumeChoice = (r: Pick<QueueResume, "interrupted">): QueueResumeChoice => (r.interrupted ? "continue" : "send");

/** 選ぶものごとの説明（乗せたときの説明） */
export const QUEUE_RESUME_TIPS: Record<QueueResumeChoice, string> = {
  send: "送る（自動で送るのまま、送信待ちを先頭から送ります）",
  continue: "続けてから送る（アプリの終了で止まった作業を続けるよう頼み、その作業が終わってから送信待ちを送ります）",
  pause: "止めておく（送信待ちは残したまま「止めています」にします。あとから「自動で送る」・行の「すぐ送る」で送れます）",
  later: "あとで（いまは決めずに残します。送りません。チャットの送信待ちの上の帯・下の帯の「決めていない送信待ち」から決められます）",
};
