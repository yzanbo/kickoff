// AI からの質問（AskUserQuestion）の選択肢の図（preview）の扱い（コア・画面の両方で使う。Node 依存を持ち込まないこと）
import type { Question } from "@shared/types";

/** 複数選んだ選択肢の図をつなぐ区切り */
const PREVIEW_JOIN = "\n\n";

/**
 * 答えた選択肢の図を、質問ごとに（質問の文 → 図）。図のある選択肢を選んだ質問だけを入れ、いくつも選んだら選んだ順につなぐ。
 * 「その他」の文（選択肢にない答え）は図がないので入れない。どれにも図がなければ undefined（回答の記録に残して、あとで見られるようにする）
 */
export function chosenPreviews(questions: readonly Question[], answers: Record<string, string | string[]>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const answer = answers[q.question];
    if (answer === undefined) continue;
    const labels = Array.isArray(answer) ? answer : [answer];
    const previews = labels.flatMap((label) => q.options.find((o) => o.label === label)?.preview?.trim() || []);
    if (previews.length > 0) out[q.question] = previews.join(PREVIEW_JOIN);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 質問の選択肢に図があるか（質問のカードで、図の欄を置くかに使う） */
export const hasPreviews = (q: Question): boolean => q.options.some((o) => Boolean(o.preview?.trim()));
