import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { BOARD_HEADER_LAYOUT } from "@/lib/storageKeys";

/**
 * ボードのツールバー（新規・表示・グループの作成・検索などの帯。部品は BoardHeader）の置き方。
 * top = 常時表示（横幅いっぱいに出し、パネルの上にも通す。右のパネルはツールバーの下から始まる。パネルがボードを覆っても見える）/
 * beside = パネル優先（右のパネルを開いたら、パネルを上端まで伸ばし、ツールバーはボードの側（パネルの左）にだけ出す。チャットの縦の幅が広がり、
 * パネルがボードを覆う・横幅いっぱいのときはツールバーも隠れる）
 */
export type BoardHeaderLayout = SettingValue<typeof BOARD_HEADER_LAYOUT>;
export const BOARD_HEADER_LAYOUTS = BOARD_HEADER_LAYOUT.choices;

/**
 * 置き方の名前（設定の「表示」と、ツールバーの右クリックのメニューで共通）。いつ見えるかと、何を優先するかで呼ぶ
 * （以前の「横幅いっぱい / ボードの上だけ」は、パネルを開いたときに何が変わるのか分かりにくかった）
 */
export const BOARD_HEADER_LAYOUT_LABELS: Record<BoardHeaderLayout, string> = { top: "常時表示", beside: "パネル優先" };

/** ボードのツールバーの置き方（どのボードでも同じ） */
export function useBoardHeaderLayout() {
  return useSetting(BOARD_HEADER_LAYOUT);
}
