// 右サイドバーで見ている中身（右端のアイコンの列で切り替える）。
// 値はプロジェクトごとに localStorage に覚えるので、右サイドバーを別ウィンドウへ移していても、メインのウィンドウの列から切り替えられる
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/projects/ui/storage";
import { panelKey, panelStateOf, setPanelOpen, sidePanelsHandedOut } from "@/features/panel/ui";
import { availableProjectViews } from "@/features/projects/ui/projectViews";
import { openSideWindow } from "./useRightSidebar";

/** 右サイドバーの中身（画面の表 projectViews のうち右サイドバーに置ける画面の名前。初めはブラウザ） */
export type SideView = string;
const SIDE_VIEW_INITIAL = "browser";

/** 覚えた値を中身にする（右サイドバーに置けない・この Mac のアプリの外で出せない画面・空はブラウザ） */
export const sideViewOf = (stored: string): SideView => (availableProjectViews("rightSidebar").some((v) => v.id === stored) ? stored : SIDE_VIEW_INITIAL);

/** 右サイドバーでいま見ている中身 */
export function useSideView(projectId: number): SideView {
  const [stored] = useSetting(storage.settings.sideView(projectId));
  return sideViewOf(stored);
}

/**
 * 右サイドバーをその中身で見せる（閉じていれば開く。別ウィンドウへ移していれば、そのウィンドウの中身を切り替えて前に出す）。
 * 中身の値は別ウィンドウと共有しているので、書けばそのウィンドウも切り替わる
 */
export function showSideView(projectId: number, view: SideView): void {
  writeSetting(storage.settings.sideView(projectId), view);
  if (sidePanelsHandedOut()) return openSideWindow();
  setPanelOpen(panelKey("side", projectId), true);
}

/** 右サイドバーがいまその中身を見せているか（開いている・別ウィンドウへ移しているときだけ。ほかから開くときの行き先を決める） */
export function isSideViewShown(projectId: number, view: SideView): boolean {
  if (sideViewOf(readSetting(storage.settings.sideView(projectId))) !== view) return false;
  return sidePanelsHandedOut() || panelStateOf(panelKey("side", projectId)).open;
}
