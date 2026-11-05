import { Check } from "lucide-react";
import { CloseButton } from "@/ui/IconButton";
import { dismissMemoProgress, useMemoProgress } from "./addToMemo";

/**
 * チャットの文をメモに追加している間と、追加したあとの知らせ（画面の下の真ん中。AI の要約は数秒かかる）。
 * 追加したら「開く」でそのメモを開ける（少したつと消える）
 */
export function MemoProgress() {
  const state = useMemoProgress();
  if (!state) return null;
  return (
    <div className="memo-progress" role="status">
      {state.kind === "busy" ? <span className="spinner" aria-hidden /> : <Check size={14} className="memo-progress-done" aria-hidden />}
      <span className="memo-progress-text">{state.text}</span>
      {state.kind === "done" && (
        <>
          <button className="btn btn-sm" onClick={state.open}>
            開く
          </button>
          <CloseButton onClick={dismissMemoProgress} />
        </>
      )}
    </div>
  );
}
