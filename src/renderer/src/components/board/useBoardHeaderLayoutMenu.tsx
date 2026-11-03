import { useState, type MouseEvent } from "react";
import { ChoiceMenu } from "../menus/ChoiceMenu";
import { clampToViewport } from "../PopupMenu";
import { BOARD_HEADER_LAYOUT_LABELS, BOARD_HEADER_LAYOUTS, useBoardHeaderLayout } from "./boardHeaderLayout";

/**
 * ボードの見出しの置き方（いつも上に出す / パネルを上まで伸ばす）を右クリックで選ぶメニュー。
 * ボードの見出しの何もないところと、右のパネルのタブの列の何もないところで開く。
 * open を onContextMenu に渡し、menu を描く（入力欄・ボタン・タブの上ではふつうの右クリック・そのものの右クリックを残す）
 */
export function useBoardHeaderLayoutMenu() {
  const [layout, setLayout] = useBoardHeaderLayout();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const open = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea, .panel-tab")) return;
    e.preventDefault();
    setAt(clampToViewport(e.clientX, e.clientY, 220, 100));
  };
  const menu = at && (
    <ChoiceMenu
      x={at.x}
      y={at.y}
      title="見出しの置き方"
      values={BOARD_HEADER_LAYOUTS}
      labels={BOARD_HEADER_LAYOUT_LABELS}
      value={layout}
      onPick={setLayout}
      onClose={() => setAt(null)}
    />
  );
  return { open, menu };
}
