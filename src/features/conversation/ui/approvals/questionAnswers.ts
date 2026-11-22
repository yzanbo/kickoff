// AI からの質問（AskUserQuestion）の答えの組み立て（純粋。質問のカードの状態 questionForm.ts と部品が使う）
import type { Question } from "@shared/chat/approvalTypes";
import type { Attachment } from "@shared/chat/types";

/** 選んだラベルのうち「その他」を表す印 */
export const OTHER = "__other__";
/** 「スキップ」で送る文 */
export const SKIP_MESSAGE = "ユーザーはこの質問をスキップしました。推測できる範囲で進めてください。";
/** 「その他」に文を書かずに添付だけで答えたときの文 */
const ATTACHED_ONLY = "添付のとおりです";

/** 「その他」に添えた添付の様子（回答するときに使う。アップロードの途中は回答させない） */
export interface OtherFiles {
  attachments: Attachment[];
  uploading: boolean;
}

/** 1 問の答えの入力（選んだラベル（「その他」は OTHER）・「その他」の文と添付） */
export interface QuestionPick {
  selected: readonly string[];
  other: string;
  files: OtherFiles | null;
}

export interface BuiltAnswers {
  /** 質問の文 → 答え（複数選ぶ質問は配列）。答えていない質問は入らない */
  answers: Record<string, string | string[]>;
  /** 質問の文 → 「その他」に添えた添付 */
  attachments: Record<string, Attachment[]>;
  /** 質問ごとの答えたか（位置の順） */
  answered: boolean[];
  /** 「その他」の添付をアップロードしている途中か（途中は回答させない。添付が抜け落ちないように） */
  uploading: boolean;
  /** すべて答えて、アップロードの途中でもない */
  complete: boolean;
}

/** 質問ごとの入力（位置の順）から、送る答えを組み立てる */
export function buildAnswers(questions: readonly Question[], picks: readonly (QuestionPick | undefined)[]): BuiltAnswers {
  const answers: Record<string, string | string[]> = {};
  const attachments: Record<string, Attachment[]> = {};
  let uploading = false;
  questions.forEach((q, i) => {
    const pick = picks[i];
    const selected = pick?.selected ?? [];
    const otherPicked = selected.includes(OTHER);
    const files = otherPicked ? (pick?.files?.attachments ?? []) : [];
    if (otherPicked && pick?.files?.uploading) uploading = true;
    // 「その他」は文を書かずに添付だけでも答えられる
    const otherText = (pick?.other ?? "").trim() || (files.length > 0 ? ATTACHED_ONLY : "");
    const picked = selected.map((l) => (l === OTHER ? otherText : l)).filter(Boolean);
    if (picked.length > 0) answers[q.question] = q.multiSelect ? picked : picked[0];
    if (files.length > 0) attachments[q.question] = files;
  });
  const answered = questions.map((q) => answers[q.question] !== undefined);
  return { answers, attachments, answered, uploading, complete: answered.every(Boolean) && !uploading };
}

/** 図の欄に出す選択肢の図（乗せた・ピントのある選択肢 → 選んだ選択肢 → 図のある最初の選択肢。図のない選択肢に乗せている間は、選んだもの・最初のものの図のまま） */
export function shownPreview(q: Question, peeked: string | null, picked: readonly string[]): { label: string; preview: string } | null {
  const withPreview = (label: string | null | undefined) => {
    const o = q.options.find((x) => x.label === label);
    return o?.preview?.trim() ? { label: o.label, preview: o.preview } : null;
  };
  return withPreview(peeked) ?? picked.map(withPreview).find(Boolean) ?? withPreview(q.options.find((o) => o.preview?.trim())?.label);
}
