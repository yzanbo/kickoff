import { useSharedChoice } from "../../hooks/useStoredState";
import { BOARD_HEADER_LAYOUT_KEY } from "../../storageKeys";

/**
 * ボードのツールバー（新規・表示・グループの作成・検索などの帯。部品は BoardHeader）の置き方。
 * top = いつも上に出す（右のパネルはツールバーの下から始まる）/
 * beside = 右のパネルを開いたら、パネルを上端まで伸ばし、ツールバーはボードの側（パネルの左）にだけ出す（チャットの縦の幅が広がる）
 */
export type BoardHeaderLayout = "top" | "beside";
export const BOARD_HEADER_LAYOUTS: readonly BoardHeaderLayout[] = ["top", "beside"];

/** 置き方の名前（設定の「表示」と、ツールバーの右クリックのメニューで共通） */
export const BOARD_HEADER_LAYOUT_LABELS: Record<BoardHeaderLayout, string> = { top: "いつも上に出す", beside: "パネルを上まで伸ばす" };

/** ボードのツールバーの置き方（どのボードでも同じ） */
export function useBoardHeaderLayout() {
  return useSharedChoice<BoardHeaderLayout>(BOARD_HEADER_LAYOUT_KEY, BOARD_HEADER_LAYOUTS, "top");
}
