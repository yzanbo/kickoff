import { useState, type MouseEvent } from "react";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { clampToViewport } from "@/ui/PopupMenu";
import { BOARD_HEADER_LAYOUT_LABELS, BOARD_HEADER_LAYOUTS, useBoardHeaderLayout } from "./boardHeaderLayout";

/**
 * ボードのツールバー（新規・表示・グループの作成・検索などの帯）の置き方（常時表示 / パネル優先）を右クリックで選ぶメニュー。
 * ボードのツールバーの何もないところと、右のパネルのタブの列の何もないところで開く。
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
      title="ボードツールバーの置き方"
      values={BOARD_HEADER_LAYOUTS}
      labels={BOARD_HEADER_LAYOUT_LABELS}
      value={layout}
      onPick={setLayout}
      onClose={() => setAt(null)}
    />
  );
  return { open, menu };
}
