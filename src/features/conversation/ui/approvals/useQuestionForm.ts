import { useState, type KeyboardEvent } from "react";
import type { Approval, Question } from "@shared/chat/approvalTypes";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/conversation/ui/storage";
import { buildAnswers, SKIP_MESSAGE } from "./questionAnswers";
import { currentOf, EMPTY_QUESTION_FORM, keyPick, reduceQuestionForm, type QuestionFormAction } from "./questionForm";
import { useResolve } from "./useResolveApproval";

/**
 * 質問のカードの状態と操作（状態の移り変わりは questionForm.ts、答えの組み立ては questionAnswers.ts）。
 * 質問が 2 つ以上なら、出し方（1 問ずつ / すべて）を設定に覚える
 */
export function useQuestionForm(approval: Approval) {
  const questions = (approval.input.questions as Question[] | undefined) ?? [];
  const { sending, error, resolve } = useResolve(approval.id);
  const [layout, setLayout] = useSetting(storage.settings.questionLayout);
  const stepped = layout === "steps" && questions.length > 1;
  const [form, setForm] = useState(EMPTY_QUESTION_FORM);
  const ctx = { questions, stepped };
  const dispatch = (action: QuestionFormAction) => setForm((prev) => reduceQuestionForm(prev, action, ctx));
  const current = currentOf(form, questions.length);
  const built = buildAnswers(questions, form.entries);
  const isLast = current >= questions.length - 1;

  const answer = () => {
    if (!sending && built.complete) void resolve({ action: "answer", answers: built.answers, ...(Object.keys(built.attachments).length > 0 ? { attachments: built.attachments } : {}) });
  };
  /** 次へ（いまの質問に答えていれば。最後なら回答） */
  const next = () => {
    if (!built.answered[current]) return;
    if (isLast) answer();
    else dispatch({ type: "step", index: current + 1 });
  };
  const skip = () => void resolve({ action: "deny", message: SKIP_MESSAGE });
  /** キーの 1〜9 で、いまの質問の選択肢を選ぶ */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = keyPick(e.key, form, ctx, { modified: e.metaKey || e.ctrlKey || e.altKey, inField: Boolean((e.target as HTMLElement).closest("textarea, input[type=text]")) });
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  };

  return { questions, form, current, stepped, isLast, layout, setLayout, sending, error, ...built, dispatch, answer, next, skip, onKeyDown };
}
