// パネルのタブの中身から、自分のタブへの操作を使う口（PanelTabPage が中身を包んで渡す。パネルの外で描いた中身では null）
import { createContext, useContext } from "react";

export interface TabPageActions {
  /** このタブを別ウィンドウへ移す（別ウィンドウで開けないタブ・ブラウザでは null） */
  popOut: (() => void) | null;
}

export const TabPageContext = createContext<TabPageActions | null>(null);

/** 自分のタブへの操作（パネルの外で描いているときは null） */
export const useTabPage = () => useContext(TabPageContext);
