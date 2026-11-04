import { useState, type KeyboardEvent, type RefObject } from "react";
import { isKey } from "@/lib/keys";
import { historyMove } from "@/features/chat/prompts/promptHistory";

/**
 * チャット欄の ↑↓ で、前に送った自分の発言を呼び出す。
 * prompts（新しい順）がなければ使わない（新しいチャットの入力欄）。判定は promptHistory.ts の historyMove
 */
export function usePromptHistory({
  prompts,
  text,
  setText,
  textareaRef,
}: {
  prompts: string[] | undefined;
  text: string;
  setText: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  // いま出している発言の位置（-1 = 呼び出していない）
  const [index, setIndex] = useState(-1);
  // 呼び出した文を書き換えずに出している間（/ と @ の候補を出さない）
  const recalled = index >= 0 && prompts?.[index] === text;

  /** ↑↓ を履歴に使ったら true */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    // 日本語入力の変換中・修飾キー付きは、普通の操作に任せる
    const key = isKey(e, "ArrowUp") ? "ArrowUp" : isKey(e, "ArrowDown") ? "ArrowDown" : null;
    if (!prompts || !key) return false;
    const el = e.currentTarget;
    const next = historyMove({ key, prompts, index, text, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd });
    if (!next) return false;
    e.preventDefault();
    setIndex(next.index);
    setText(next.text);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next.caret, next.caret));
    return true;
  };

  // 送って空になったら、index は残っていても空の入力欄として扱われ、次の ↑ はいちばん新しい発言から
  return { recalled, handleKey };
}
