// パネルのタブの中身から、自分のタブへの操作を使う口（PanelTabPage が中身を包んで渡す。パネルの外で描いた中身では null）
import { createContext, useContext } from "react";

export interface TabPageActions {
  /** このタブを別ウィンドウへ移す（別ウィンドウで開けないタブ・ブラウザでは null） */
  popOut: (() => void) | null;
  /** このタブを表に出す（閉じた欄なら開く。入れ子の欄なら外のタブも表に出す） */
  show: () => void;
}

export const TabPageContext = createContext<TabPageActions | null>(null);

/** 自分のタブへの操作（パネルの外で描いているときは null） */
export const useTabPage = () => useContext(TabPageContext);

/**
 * 自分を含むタブが表示中か（入れ子の欄で、外のタブの見え方も含める。PanelTabPage が入れる。パネルの外では true）。
 * チャットの画面の右の欄は会話の欄の外（殻）にあり、裏のタブでも動き続けるので、右の欄のタブ（サブエージェント・子チャット）は
 * これで外のチャットのタブが裏に回ったことを知って止まる
 */
export const TabVisibleContext = createContext(true);
