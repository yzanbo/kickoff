import { useState, type KeyboardEvent } from "react";

/** 入力欄の ↑↓ で候補を選び、Enter で決める（変換中の Enter は除く）。候補が変わったら、呼ぶ側で setIndex(0) する */
export function useListNavigation<T>(items: T[], onPick: (item: T | undefined) => void) {
  const [index, setIndex] = useState(0);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onPick(items[index]);
    }
  };
  return { index, setIndex, onKeyDown };
}
