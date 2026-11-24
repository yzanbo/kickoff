import { panelSettings, useCoverableWidth } from "@/features/panel/ui";

const MIN_PANEL_WIDTH = 360;
/** ボードとパネルの間隔（Panel.css の .board-body.with-panel の gap） */
const PANEL_GAP = 12;
/**
 * パネルの横に残るボードがこれより狭くなるなら、パネルでボードを覆う（列が 1 本も入らない細い帯を残さない）。
 * 狭いボードは列を 1 本ずつめくる表示になる（KanbanBody.css の @container）ので、1 本が収まる幅にする
 */
const MIN_BOARD_WIDTH = 200;

/**
 * ボードの右側のパネルの幅（左端のつまみのドラッグで変える。覚えておく）と、横幅いっぱい（ボードを覆う）の切り替え。
 * 横に残るボードが狭すぎるとき（チャット欄を広げた・ウィンドウを狭めた）は、覚えた幅のままボードを覆い、広がったら戻す（決まりは useCoverableWidth）。
 * bodyRef と style は、ボードとパネルを並べる要素（usePanel の body）に渡す。
 * maximizable が false の間（タブの列を隠していて、横幅いっぱいの切り替えのボタンがない）は、覚えた横幅いっぱいを効かせない
 */
export function usePanelWidth({ maximizable }: { maximizable: boolean }) {
  return useCoverableWidth({
    width: panelSettings.width,
    maximized: panelSettings.maximized,
    maximizable,
    min: MIN_PANEL_WIDTH,
    gap: PANEL_GAP,
    minRest: MIN_BOARD_WIDTH,
    widthVar: "--panel-w",
    shownVar: "--panel-shown",
  });
}
