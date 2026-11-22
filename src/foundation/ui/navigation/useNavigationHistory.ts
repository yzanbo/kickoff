import { useSyncExternalStore } from "react";
import { navigate } from "./router";
import type { createNavigationHistory } from "./navigationHistory";

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
  return {
    canGoBack: state.index > 0,
    canGoForward: state.index < state.entries.length - 1,
    goBack: () => move(-1),
    goForward: () => move(1),
    /** ⌘[ / ⌘] の 1 歩（動けなければ false = キーを奪わない。App がコマンドに渡す） */
    step: (step: -1 | 1): boolean => {
      const { entries, index } = history.getSnapshot();
      if (!entries[index + step]) return false;
      move(step);
      return true;
    },
  };
}
