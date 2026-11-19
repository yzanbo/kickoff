import { useSyncExternalStore } from "react";
import { navigate } from "./router";
import type { createNavigationHistory } from "./navigationHistory";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";

/** 左上のボタンと ⌘[ / ⌘] で、Kickoff の前の画面・次の画面へ移る */
export function useNavigationHistory(history: ReturnType<typeof createNavigationHistory>, revealPage: () => void) {
  const state = useSyncExternalStore(history.subscribe, history.getSnapshot);

  const move = (step: -1 | 1) => {
    const route = history.move(step);
    if (!route) return;
    revealPage();
    // 履歴をたどる移動は、新しい移動として積み直さない
    navigate(route, { replace: true });
  };
  useWindowEvent("keydown", (event) => {
    if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || (event.key !== "[" && event.key !== "]")) return;
    // コードの字下げや、開いているダイアログの操作を奪わない
    if (event.defaultPrevented || (event.target as HTMLElement | null)?.closest?.(".monaco-editor, .cm-editor, [role=dialog], [aria-modal=true]")) return;
    const step = event.key === "[" ? -1 : 1;
    const { entries, index } = history.getSnapshot();
    if (!entries[index + step]) return;
    event.preventDefault();
    move(step);
  });

  return {
    canGoBack: state.index > 0,
    canGoForward: state.index < state.entries.length - 1,
    goBack: () => move(-1),
    goForward: () => move(1),
  };
}
