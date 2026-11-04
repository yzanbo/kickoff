import type { QueuedMessage } from "@shared/types";
import { useMultiSelect } from "@/hooks/useMultiSelect";
import { useWindowEvent } from "@/hooks/useWindowEvent";

/**
 * 送信待ちの行の複数選択（決まりは useMultiSelect: ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を足す。範囲は列の順）。
 * 選んだものだけ、まとめて送る・消す・移す。列から消えた指示は外す。Esc で選ぶのをやめる（パネルを閉じる Esc より先に受け取る）
 */
export function useQueueSelection(queue: QueuedMessage[]) {
  const ids = queue.map((m) => m.id);
  const select = useMultiSelect(ids, () => ids);
  const { selected } = select;
  // Esc で選ぶのをやめる（パネルを閉じる Esc より先に受け取る）
  useWindowEvent(
    "keydown",
    (e) => {
      // メニュー・ダイアログが開いているときは、そちらを閉じる Esc に任せる
      if (e.key !== "Escape" || document.querySelector("[role=menu], dialog[open]")) return;
      e.stopPropagation();
      select.clear();
    },
    selected.length > 0,
    true,
  );
  return {
    selected,
    /** 行のクリック（修飾キーがなければ、選んでいるものをやめるだけ） */
    selectRow: (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, id: string) => void select.click(e, id),
    clearSelection: select.clear,
  };
}
