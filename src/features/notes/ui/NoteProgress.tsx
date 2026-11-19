import { Check } from "lucide-react";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { dismissNoteProgress, useNoteProgress } from "./addToNote";

/**
 * チャットの文をノートに追加している間と、追加したあとの知らせ（画面の下の真ん中。AI の要約は数秒かかる）。
 * 追加したら「開く」でそのノートを開ける（少したつと消える）
 */
export function NoteProgress() {
  const state = useNoteProgress();
  if (!state) return null;
  return (
    <div className="note-progress" role="status">
      {state.kind === "busy" ? <span className="spinner" aria-hidden /> : <Check size={14} className="note-progress-done" aria-hidden />}
      <span className="note-progress-text">{state.text}</span>
      {state.kind === "done" && (
        <>
          <button className="btn btn-sm" onClick={state.open}>
            開く
          </button>
          <CloseButton onClick={dismissNoteProgress} />
        </>
      )}
    </div>
  );
}
