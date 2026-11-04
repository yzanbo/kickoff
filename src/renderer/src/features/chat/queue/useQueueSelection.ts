import { useState } from "react";
import type { QueuedMessage } from "@shared/types";
import { useWindowEvent } from "@/hooks/useWindowEvent";

/**
 * 送信待ちの行の複数選択: ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選ぶ（選んだものだけ、まとめて送る・消す・移す）。
 * 列から消えた指示は外す。Esc で選ぶのをやめる（パネルを閉じる Esc より先に受け取る）
 */
export function useQueueSelection(queue: QueuedMessage[]) {
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string>();
  const selected = queue.filter((m) => picked.includes(m.id)).map((m) => m.id);
  const clearSelection = () => {
    setPicked([]);
    setAnchor(undefined);
  };
  /** 行のクリック（修飾キーがなければ、選んでいるものをやめるだけ） */
  const selectRow = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, id: string) => {
    if (e.shiftKey && anchor) {
      const from = queue.findIndex((m) => m.id === anchor);
      const to = queue.findIndex((m) => m.id === id);
      const range = queue.slice(Math.min(from, to), Math.max(from, to) + 1).map((m) => m.id);
      setPicked((prev) => [...new Set([...(e.metaKey || e.ctrlKey ? prev : []), ...range])]);
    } else if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      setAnchor(id);
    } else if (selected.length > 0) {
      clearSelection();
    }
  };
  // Esc で選ぶのをやめる（パネルを閉じる Esc より先に受け取る）
  useWindowEvent(
    "keydown",
    (e) => {
      // メニュー・ダイアログが開いているときは、そちらを閉じる Esc に任せる
      if (e.key !== "Escape" || document.querySelector("[role=menu], dialog[open]")) return;
      e.stopPropagation();
      clearSelection();
    },
    selected.length > 0,
    true,
  );
  return { selected, selectRow, clearSelection };
}
