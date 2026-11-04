import type { MouseEvent } from "react";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { BOARD_HEADER_LAYOUT_LABELS, BOARD_HEADER_LAYOUTS, useBoardHeaderLayout } from "./boardHeaderLayout";

/**
 * ボードのツールバー（新規・表示・グループの作成・検索などの帯）の置き方（常時表示 / パネル優先）を右クリックで選ぶメニュー。
 * ボードのツールバーの何もないところと、右のパネルのタブの列の何もないところで開く。
 * open を onContextMenu に渡し、menu を描く（入力欄・ボタン・タブの上ではふつうの右クリック・そのものの右クリックを残す）
 */
export function useBoardHeaderLayoutMenu() {
  const [layout, setLayout] = useBoardHeaderLayout();
  const choice = useContextMenu();
  const open = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea, .panel-tab")) return;
    choice.open(e);
  };
  const menu = choice.menu && (
    <ChoiceMenu
      at={choice.menu.at}
      title="ボードツールバーの置き方"
      values={BOARD_HEADER_LAYOUTS}
      labels={BOARD_HEADER_LAYOUT_LABELS}
      value={layout}
      onPick={setLayout}
      onClose={choice.close}
    />
  );
  return { open, menu };
}
