// 子チャットから親チャットへの依頼文の受け渡し（子チャットの AI に依頼文を書かせ、その返答を親に渡す）。
// 頼み方の文・渡し方と渡したあとの選び方・作業の最後の返答の取り出し（コア・画面で同じものを使う。Node 依存なし）
import type { ChatEvent, HandoffFrom, HandoffVia, MessageMarks } from "@shared/types";
import { UNTITLED_CHAT_TITLE } from "@shared/types";

/** 渡したあとの子チャット: そのまま / アーカイブ / 削除（削除は今すぐ送る・送信待ちで渡したときだけ。入力欄ならアーカイブにする） */
export const HANDOFF_AFTERS = ["keep", "archive", "delete"] as const;
export type HandoffAfter = (typeof HANDOFF_AFTERS)[number];
/** 渡したあとの名前（「親チャットに追加 ▾」のメニュー・設定） */
export const HANDOFF_AFTER_LABELS: Record<HandoffAfter, string> = { keep: "そのまま", archive: "アーカイブ", delete: "削除" };

/** 渡したあとに実際に行うこと（入力欄に入れたときは、入力欄で消すと依頼文がどこにも残らなくなるので、削除の代わりにアーカイブ） */
export function handoffAfterFor(after: HandoffAfter, via: HandoffVia): HandoffAfter {
  return after === "delete" && via === "composer" ? "archive" : after;
}

/**
 * 子チャットに依頼文を書いてもらう頼み方の文（「親への依頼文を作ってもらう」で送る。記録には handoff_request の印を付ける）。
 * 返答はそのまま親チャットの入力欄に入り、親の AI への指示として送られるので、依頼文だけを書かせる
 */
export function handoffRequestPrompt(childTitle: string): string {
  const name = childTitle.trim() || UNTITLED_CHAT_TITLE;
  return [
    "親チャットに渡す依頼文を書いてください。",
    "",
    "あなたの返答は、そのまま親チャットの入力欄に入り、親チャットの AI への指示として送られます。次を守ってください。",
    "- 返答は依頼文だけにする。前置き（「依頼文を作りました」など）・説明・最後のあいさつ・私への確認の質問は書かない。",
    "- 依頼文の全体をコードブロックや引用で囲まない。",
    "- 親チャットの AI に向けて書く。私（利用者）に向けた言葉にしない。",
    `- 頭は「子チャット「${name}」で検討した結果、次をお願いします。」で始める。`,
    "- 親チャットの AI は、この子チャットの会話を見られない。この会話で分かったこと・決めたことは、依頼文の中に書く。親チャットの会話にもともとあった背景はくり返さない。",
    "- 入れること：やってほしいこと（手順）、決まったことと理由、触るファイル・関数の名前、まだ決めていないこと（あれば）。",
    "- この会話で決まっていないことを勝手に決めない。出ていないことは足さない。",
    "- 確かめるためにファイルを読むのはよいが、ファイルは書き換えない。最後の返答には依頼文だけを書く。",
    "- このあと依頼文を直すよう頼まれたら、直した依頼文の全文だけを書く。",
  ].join("\n");
}

/** 子チャットの AI に渡す文脈に足す 1 行（利用者が自分の言葉で頼み直しても、同じ形の返答になるように） */
export const HANDOFF_CONTEXT_RULE = "親に渡す依頼文を頼まれたら（直すよう頼まれたときも）、依頼文の全文だけを書く。前置き・説明・確認の質問は書かない。";

/**
 * その作業（作業の終わりの記録 resultEventId）の最後の返答: 終わりの直前の、メインエージェントのひと続きの文（途中でファイルを読む前の
 * 「確認します」などは、最後の返答ではないので入れない）。サブエージェントの記録・思考・お知らせは飛ばし、メインのツール・発言・作業の終わりで区切る。
 * 返答がなければ null
 */
export function lastReplyOfTurn(events: readonly ChatEvent[], resultEventId: number): string | null {
  const end = events.findIndex((e) => e.id === resultEventId);
  return end < 0 ? null : lastReplyBefore(events, end);
}

/** 記録の end 番目（作業の終わり）の直前の、最後の返答（lastReplyOfTurn の位置で引く版。流れの組み立てで、作業の終わりごとに探し直さない） */
export function lastReplyBefore(events: readonly ChatEvent[], end: number): string | null {
  const parts: string[] = [];
  for (let i = end - 1; i >= 0; i--) {
    const e = events[i];
    const parent = "parent" in e.data ? e.data.parent : undefined;
    if (e.type === "text" && !parent) {
      parts.unshift(e.data.text);
      continue;
    }
    // 飛ばすもの: サブエージェントの中の記録・思考・サブエージェントの知らせ・お知らせ・承認の依頼と回答・セッションの始まり・渡したことの印
    if (parent || e.type === "thinking" || e.type === "subagent" || e.type === "notice" || e.type === "approval" || e.type === "init" || e.type === "handoff") continue;
    break;
  }
  const text = parts.join("\n\n").trim();
  return text || null;
}

/** 発言の印だけを取り出す（付いていないものは入れない。送信待ちの行・API の本文から、送る・伝えるへ渡すとき） */
export function marksOf(src: { handoff_request?: boolean; handoff_from?: HandoffFrom }): MessageMarks {
  return { ...(src.handoff_request ? { handoff_request: true as const } : {}), ...(src.handoff_from ? { handoff_from: src.handoff_from } : {}) };
}
