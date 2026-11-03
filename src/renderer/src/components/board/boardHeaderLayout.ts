import { useSharedChoice } from "../../hooks/useStoredState";
import { BOARD_HEADER_LAYOUT_KEY } from "../../storageKeys";

/**
 * ボードの見出しの置き方。
 * top = いつも上に出す（右のパネルは見出しの下から始まる）/
 * beside = 右のパネルを開いたら、パネルを上端まで伸ばし、見出しはボードの側（パネルの左）にだけ出す（チャットの縦の幅が広がる）
 */
export type BoardHeaderLayout = "top" | "beside";
export const BOARD_HEADER_LAYOUTS: readonly BoardHeaderLayout[] = ["top", "beside"];

/** 置き方の名前（設定の「表示」と、見出しの右クリックのメニューで共通） */
export const BOARD_HEADER_LAYOUT_LABELS: Record<BoardHeaderLayout, string> = { top: "いつも上に出す", beside: "パネルを上まで伸ばす" };

/** ボードの見出しの置き方（どのボードでも同じ） */
export function useBoardHeaderLayout() {
  return useSharedChoice<BoardHeaderLayout>(BOARD_HEADER_LAYOUT_KEY, BOARD_HEADER_LAYOUTS, "top");
}
