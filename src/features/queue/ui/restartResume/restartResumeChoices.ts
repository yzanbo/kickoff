// 起動したときの再開の確かめで選ぶもの（ダイアログとチャットの中の帯で共通）
import { restartResumeActionLabel, type RestartResume, type RestartResumeAction } from "@shared/types";

/** ダイアログで選ぶもの: 答え（送る / 続ける / 止めておく）と、決めずに残す「あとで」 */
export type RestartResumeChoice = RestartResumeAction | "later";

/** 選んでいないときの答え: 作業の途中で止まったチャットは続ける（送信待ちがあれば続けてから送る）、ほかは送る */
export const defaultResumeChoice = (r: Pick<RestartResume, "interrupted">): RestartResumeAction => (r.interrupted ? "continue" : "send");

/** そのチャットで選べる答え（送るは送信待ちがあるときだけ、続けるは作業の途中で止まったときだけ） */
export const resumeActionsFor = (r: Pick<RestartResume, "interrupted" | "queued">): RestartResumeAction[] =>
  (["send", "continue", "pause"] as const).filter((a) => (a !== "send" || r.queued) && (a !== "continue" || r.interrupted));

/** 選ぶものの名前（送信待ちがあるかで変える） */
export const resumeChoiceLabel = (choice: RestartResumeChoice, queued: boolean): string => (choice === "later" ? "あとで" : restartResumeActionLabel(choice, queued));

/** 選ぶものごとの説明（乗せたときの説明。送信待ちがあるかで変える） */
export function resumeChoiceTip(choice: RestartResumeChoice, queued: boolean): string {
  const label = resumeChoiceLabel(choice, queued);
  switch (choice) {
    case "send":
      return `${label}（自動で送るのまま、送信待ちを先頭から送ります。止まった作業は続けません）`;
    case "continue":
      return queued
        ? `${label}（アプリの終了で止まった作業を続けるよう頼み、その作業が終わってから送信待ちを送ります）`
        : `${label}（アプリの終了で止まった作業を、止まったところから続けるよう頼みます。途中だったサブエージェントも再開させます）`;
    case "pause":
      return queued
        ? `${label}（送信待ちは残したまま「止めています」にします。止まった作業も続けません。あとから「自動で送る」・行の「すぐ送る」で送れます）`
        : `${label}（作業は止めたままにします。続けるときは、メッセージを送ってください）`;
    case "later":
      return `${label}（いまは決めずに残します。続けず・送りません。チャットの入力欄の上の帯・下の帯の「決めていない再開」から決められます）`;
  }
}
