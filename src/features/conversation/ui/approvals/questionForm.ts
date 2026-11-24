// 質問のカードの状態（純粋）: いまの質問・たたんだか・質問ごとの入力と図を見ている選択肢。入力は質問の位置をキーに持つ
import type { Question } from "@shared/chat/approvalTypes";
import { OTHER, type OtherFiles, type QuestionPick } from "./questionAnswers";

/** 1 問の入力と、図を見ている選択肢（乗せた・ピントのある選択肢のラベル） */
export interface QuestionEntry extends QuestionPick {
  peek: string | null;
}

export interface QuestionForm {
  /** 1 問ずつのときの、いまの質問の位置（質問の数より大きければ最後の質問） */
  step: number;
  /** たたんだ（見出しといまの質問の 1 行だけ。入力は残す） */
  folded: boolean;
  /** 質問ごとの入力（位置の順。まだ触っていない質問は undefined） */
  entries: readonly (QuestionEntry | undefined)[];
}

export type QuestionFormAction =
  | { type: "toggle"; index: number; label: string }
  | { type: "other"; index: number; text: string }
  | { type: "files"; index: number; files: OtherFiles }
  | { type: "peek"; index: number; label: string | null }
  | { type: "step"; index: number }
  | { type: "fold"; folded: boolean };

/** 当てるときに要る質問と出し方（stepped = 1 問ずつ進める） */
export interface QuestionFormContext {
  questions: readonly Question[];
  stepped: boolean;
}

export const EMPTY_QUESTION_FORM: QuestionForm = { step: 0, folded: false, entries: [] };
const EMPTY_ENTRY: QuestionEntry = { selected: [], other: "", files: null, peek: null };

/** いまの質問の位置 */
export const currentOf = (form: QuestionForm, count: number): number => Math.max(0, Math.min(form.step, count - 1));

const withEntry = (form: QuestionForm, index: number, change: (e: QuestionEntry) => QuestionEntry): QuestionForm => {
  const before = form.entries[index] ?? EMPTY_ENTRY;
  const after = change(before);
  if (after === before) return form;
  const entries = [...form.entries];
  entries[index] = after;
  return { ...form, entries };
};

/** 選ぶ（1 つ選ぶ質問は選び直し、複数選ぶ質問は付け外し）。1 問ずつのとき、1 つ選ぶ質問で選択肢を選んだら次の質問へ（「その他」は書いてから進む） */
function toggle(form: QuestionForm, index: number, label: string, { questions, stepped }: QuestionFormContext): QuestionForm {
  const q = questions[index];
  if (!q) return form;
  const next = withEntry(form, index, (e) => ({
    ...e,
    selected: !q.multiSelect ? [label] : e.selected.includes(label) ? e.selected.filter((l) => l !== label) : [...e.selected, label],
  }));
  return stepped && !q.multiSelect && label !== OTHER && index < questions.length - 1 ? { ...next, step: index + 1 } : next;
}

/** 「その他」を選ぶ（選んでいなければ。1 つ選ぶ質問ではほかの選択を外す） */
const pickOther = (e: QuestionEntry, q: Question): QuestionEntry =>
  e.selected.includes(OTHER) ? e : { ...e, selected: q.multiSelect ? [...e.selected, OTHER] : [OTHER] };

export function reduceQuestionForm(form: QuestionForm, action: QuestionFormAction, ctx: QuestionFormContext): QuestionForm {
  switch (action.type) {
    case "toggle":
      return toggle(form, action.index, action.label, ctx);
    case "other":
      return withEntry(form, action.index, (e) => ({ ...e, other: action.text }));
    case "files": {
      const q = ctx.questions[action.index];
      // ドラッグで添付したとき（欄に入らずに添付した）も「その他」を選ぶ（選ばないと添付が回答に入らない）
      const picks = q && (action.files.attachments.length > 0 || action.files.uploading);
      return withEntry(form, action.index, (e) => (picks ? pickOther({ ...e, files: action.files }, q) : { ...e, files: action.files }));
    }
    case "peek":
      return withEntry(form, action.index, (e) => (e.peek === action.label ? e : { ...e, peek: action.label }));
    case "step":
      return { ...form, step: action.index };
    case "fold":
      return { ...form, folded: action.folded };
  }
}

/**
 * キーの 1〜9 で選ぶいまの質問の選択肢（1 問ずつ・質問が 1 つのときだけ。修飾キー・文を書いている欄では効かせない）。選ばないなら null
 */
export function keyPick(key: string, form: QuestionForm, ctx: QuestionFormContext, mods: { modified: boolean; inField: boolean }): QuestionFormAction | null {
  if (mods.modified || mods.inField) return null;
  if (ctx.questions.length > 1 && !ctx.stepped) return null;
  const current = currentOf(form, ctx.questions.length);
  const option = ctx.questions[current]?.options[Number(key) - 1];
  if (!/^[1-9]$/.test(key) || !option) return null;
  return { type: "toggle", index: current, label: option.label };
}
