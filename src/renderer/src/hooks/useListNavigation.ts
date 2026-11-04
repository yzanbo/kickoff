import { useState, type KeyboardEvent } from "react";
import { isComposing } from "@/lib/keys";

/**
 * ↑↓ で選ぶ位置を 1 つ動かす。アプリ全体の候補・メニュー・選択欄で同じ決まり: 端では回り込む（最後の次は先頭、先頭の前は最後。
 * macOS のメニューと同じ）。まだ選んでいなければ（index が範囲の外）、↓ で先頭・↑ で最後。候補がなければ -1
 */
export function stepIndex(index: number, step: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) return step > 0 ? 0 : count - 1;
  return (index + step + count) % count;
}

/**
 * 入力欄の ↑↓ で候補を選び（端では回り込む。stepIndex）、Enter で決める（日本語入力の変換中のキーは見ない）。
 * 候補が変わったら、呼ぶ側で setIndex(0) する
 */
export function useListNavigation<T>(items: T[], onPick: (item: T | undefined) => void) {
  const [index, setIndex] = useState(0);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 変換中の ↑↓（候補を選ぶ）・Enter（確定する）は、変換に使う
    if (isComposing(e)) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setIndex((i) => stepIndex(i, step, items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(items[index]);
    }
  };
  return { index, setIndex, onKeyDown };
}
