import type { Attachment, ChatEvent } from "@shared/types";
import { subagentAskOf } from "@shared/chat/prompts";
import { compactKindOf } from "@/features/snippet/compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";

/**
 * 自分の指示（発言）の一覧と、チャット欄の ↑↓ で前に送った発言を呼び出す決まり。
 * 一覧は記録から promptListOf で 1 回だけ作り、指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・↑↓ の呼び出し・失敗した作業の巻き戻しで共通に使う。
 * 判定はここの純粋関数に集め、Composer は usePromptHistory からキーを渡すだけにする
 */

/** 自分の指示の一覧の 1 行 */
export interface PromptEntry {
  /** 記録の ID */
  id: number;
  /** 送った文（前後の空白を除く。添付だけなら空） */
  text: string;
  /** 一覧に出す名前（文。添付だけならファイル名） */
  label: string;
  at: string;
  attachments: Attachment[];
  /** 圧縮の前後に送った圧縮前指示・圧縮後指示か（記録の pre_compact / post_compact。一覧で札を付けて、自分で書いた指示と見分ける。どちらでもなければ null） */
  compactKind: CompactPromptKind | null;
  /**
   * AI からの質問への回答なら、質問ごとの問いと答え（記録の approval_resolved。指示の履歴にだけ並べ、「質問への回答」の札を付ける。
   * text は空にして入力欄には入れない・label は答えだけを「 / 」でつなぐ（上に貼り付ける指示の帯をたたんだときと同じ）。指示なら null）
   */
  answers: QuestionAnswer[] | null;
  /**
   * コンテキストを消去した境目か（記録の context_cleared。指示の履歴にだけ並べ、「コンテキスト消去」の札を付ける。利用者の依頼。
   * text は空にして入力欄には入れない・番号は数えない。指示なら false）
   */
  cleared: boolean;
}

/** AI からの質問への回答の 1 問（問いの文と選んだ答え。いくつも選んだ答えは「、」でつなぐ） */
export interface QuestionAnswer {
  question: string;
  answer: string;
}

/** 記録から作った自分の指示の一覧 */
export interface PromptList {
  /** 会話の順（指示だけ。⌘⌥↑ / ↓・上に貼り付ける指示・巻き戻しはこれを使う） */
  entries: PromptEntry[];
  /**
   * 指示の履歴（ピル）に並べるもの: 指示と、AI からの質問への回答と、コンテキストの消去を会話の順に。回答も自分が入れたもので、上に貼り付ける指示の帯には出るので、
   * 履歴にも出して「どこで何と答えたか」から戻れるようにする（前は帯には出るのに履歴にはなく、そろっていなかった）。
   * コンテキストの消去は、どの指示から新しい会話になったかを履歴の中で見分けられるようにする（利用者の依頼）
   */
  history: PromptEntry[];
  /** 記録の ID の並び（会話の順） */
  ids: number[];
  /** 記録の ID → 指示 */
  byId: ReadonlyMap<number, PromptEntry>;
  /** チャット欄の ↑↓ で呼び出す文（新しい順。文のない添付だけの指示は除き、続けて同じ文は 1 つにまとめる） */
  recalls: string[];
}

const NO_ATTACHMENTS: Attachment[] = [];

/** 指示の履歴のコンテキストの消去の行の文（会話の流れの境目の行と同じ言い方） */
export const CONTEXT_CLEARED_LABEL = "ここから新しい会話";

// 記録の配列ごとの一覧（記録が増える・消えるたびに配列が替わるので、そのときだけ作り直す。読む所がいくつあっても 1 回）
const lists = new WeakMap<readonly ChatEvent[], PromptList>();

/** チャットの記録から、自分の指示の一覧（同じ記録の配列なら、作り直さずに同じものを返す） */
export function promptListOf(events: readonly ChatEvent[]): PromptList {
  const hit = lists.get(events);
  if (hit) return hit;
  const entries: PromptEntry[] = [];
  const history: PromptEntry[] = [];
  for (const e of events) {
    if (e.type === "user") {
      const data = e.data;
      // サブエージェントに子チャットで聞いた発言は、前置きを除いた聞いた文だけ
      const text = (subagentAskOf(data.text)?.text ?? data.text).trim();
      const attachments = data.attachments ?? NO_ATTACHMENTS;
      const entry: PromptEntry = { id: e.id, text, label: text || attachments.map((a) => a.name).join("、"), at: e.created_at, attachments, compactKind: compactKindOf(data), answers: null, cleared: false };
      entries.push(entry);
      history.push(entry);
    } else if (e.type === "approval_resolved" && e.data.action === "answer") {
      const answers = Object.entries(e.data.answers).map(([question, answer]) => ({ question, answer: Array.isArray(answer) ? answer.join("、") : answer }));
      const attachments = Object.values(e.data.attachments ?? {}).flat();
      history.push({ id: e.id, text: "", label: answers.map((a) => a.answer).join(" / "), at: e.created_at, attachments, compactKind: null, answers, cleared: false });
    } else if (e.type === "context_cleared") {
      // 送信待ちの「コンテキストを消去」で、ここから新しい会話にした境目（押すと会話の流れの境目の行へ移る）
      history.push({ id: e.id, text: "", label: CONTEXT_CLEARED_LABEL, at: e.created_at, attachments: NO_ATTACHMENTS, compactKind: null, answers: null, cleared: true });
    }
  }
  const recalls: string[] = [];
  for (const p of entries) if (p.text && recalls[recalls.length - 1] !== p.text) recalls.push(p.text);
  const list: PromptList = { entries, history, ids: entries.map((p) => p.id), byId: new Map(entries.map((p) => [p.id, p])), recalls: recalls.reverse() };
  lists.set(events, list);
  return list;
}

/** その記録より前の、いちばん新しい自分の指示（その作業を始めた指示。なければ undefined） */
export function promptBefore(list: PromptList, eventId: number): PromptEntry | undefined {
  return list.entries.findLast((p) => p.id < eventId);
}

export interface HistoryInput {
  key: "ArrowUp" | "ArrowDown";
  /** 前に送った発言（新しい順） */
  prompts: string[];
  /** いま出している発言の位置（-1 = 呼び出していない） */
  index: number;
  /** 入力欄の文 */
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface HistoryMove {
  index: number;
  text: string;
  /** 入れたあとのキャレットの位置 */
  caret: number;
}

/**
 * ↑↓ で履歴を動かすなら、次の状態を返す（普通のカーソル移動に任せるなら null）。
 * 使えるのは、入力欄が空のときと、呼び出した文を書き換えずに出している間だけ。
 * 複数行の文では、↑ はキャレットが 1 行目にあるとき、↓ は最後の行にあるときだけ履歴に使う
 */
export function historyMove({ key, prompts, index, text, selectionStart, selectionEnd }: HistoryInput): HistoryMove | null {
  // 書き換えていない呼び出し中の文か、空の入力欄でなければ使わない
  const current = index >= 0 && prompts[index] === text ? index : text === "" ? -1 : null;
  if (current === null || selectionStart !== selectionEnd) return null;
  const caret = selectionStart;
  if (key === "ArrowUp") {
    if (text.slice(0, caret).includes("\n")) return null;
    const next = current + 1;
    if (next >= prompts.length) return null;
    const recalled = prompts[next];
    // 続けて ↑ を押せるよう、キャレットは 1 行目の終わりに置く（1 行の文なら文の終わり）
    const firstLineEnd = recalled.indexOf("\n");
    return { index: next, text: recalled, caret: firstLineEnd === -1 ? recalled.length : firstLineEnd };
  }
  if (current < 0 || text.slice(caret).includes("\n")) return null;
  const next = current - 1;
  // いちばん新しい発言を越えたら、呼び出す前の空の入力欄に戻す
  const restored = next >= 0 ? prompts[next] : "";
  return { index: next, text: restored, caret: restored.length };
}
