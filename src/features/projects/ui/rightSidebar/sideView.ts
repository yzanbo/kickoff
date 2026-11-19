// 右サイドバーで見ている中身（右端のアイコンの列で切り替える）。
// 値はプロジェクトごとに localStorage に覚えるので、右サイドバーを別ウィンドウへ移していても、メインのウィンドウの列から切り替えられる
import { readSetting, writeSetting, type SettingValue } from "@/foundation/ui/storage/settings";
import { sideView } from "@/foundation/ui/storage/storageKeys";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { sidePanelsHandedOut } from "@/features/panel/ui/state/panelHandOff";
import { panelKey } from "@/features/panel/ui/surfaces";
import { openSideWindow } from "./useRightSidebar";

/** 右サイドバーの中身（browser = ブラウザ、ほかはプロジェクトのタブと同じ画面） */
export type SideView = SettingValue<ReturnType<typeof sideView>>;
/** 右サイドバーの中身の一覧（ブラウザが先頭。ほかの並びはプロジェクトのタブの並びに付いていく） */
export const SIDE_VIEWS = sideView.shape.choices;

/** プロジェクトのタブの名前を右サイドバーの中身にする（ボード・チャットは右サイドバーに出さないので null） */
export const sideViewOfTab = (tab: string): Exclude<SideView, "browser"> | null =>
  (SIDE_VIEWS as readonly string[]).includes(tab) && tab !== "browser" ? (tab as Exclude<SideView, "browser">) : null;

/**
 * 右サイドバーをその中身で見せる（閉じていれば開く。別ウィンドウへ移していれば、そのウィンドウの中身を切り替えて前に出す）。
 * 中身の値は別ウィンドウと共有しているので、書けばそのウィンドウも切り替わる
 */
export function showSideView(projectId: number, view: SideView): void {
  writeSetting(sideView(projectId), view);
  if (sidePanelsHandedOut()) return openSideWindow();
  panelActions(panelKey("side", projectId)).setOpen(true);
}

/** 右サイドバーがいまその中身を見せているか（開いている・別ウィンドウへ移しているときだけ。ほかから開くときの行き先を決める） */
export function isSideViewShown(projectId: number, view: SideView): boolean {
  if (readSetting(sideView(projectId)) !== view) return false;
  return sidePanelsHandedOut() || panelStateOf(panelKey("side", projectId)).open;
}
