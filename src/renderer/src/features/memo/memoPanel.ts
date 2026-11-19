// プロジェクトの「メモ」タブの右の欄（パネルの memos。開いたメモをタブで並べ、ドラッグで上下・左右に分けられる）の操作
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { focusedPane } from "@/features/panel/layout/paneTree";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf } from "@/features/panel/state/panelStore";
import { panelKey, type PanelScope, type ViewScope } from "@/features/panel/surfaces";
import { memoTab } from "@/features/panel/tabs/tabKinds";
import { confirmLeaveMemo } from "./memoGuards";
import { isUnder, remapPath } from "./memoPaths";

/** 右サイドバーのメモの右のタブの欄の範囲（真ん中のメモのタブとは別に覚える） */
export const sideMemoScope = (projectId: number): ViewScope => `view-side-${projectId}`;

/** メモのタブの右の欄の覚える名前（プロジェクトごと。scope を渡せばその範囲 = 右サイドバーのメモ） */
export const memoPanelKey = (projectId: number, scope?: PanelScope) => panelKey("memos", scope ?? projectId);

/** そのプロジェクトのメモのタブの欄すべて（真ん中のメモのタブと右サイドバー。名前の変更・ゴミ箱をどちらのタブにも効かせる） */
const memoPanelKeys = (projectId: number) => [memoPanelKey(projectId), memoPanelKey(projectId, sideMemoScope(projectId))];

type MemoPanelTab = Extract<PanelTab, { kind: "memo" }>;

const memoTabsOf = (key: string): MemoPanelTab[] => panelStateOf(key).tabs.filter((t): t is MemoPanelTab => t.kind === "memo");

/** タブの中身（チャットなし = 開いたチャットへの添付はない） */
const tabFor = (projectId: number, path: string) => memoTab({ chatId: null, projectId, path });

/**
 * メモを開く。開いていればそのタブを表示する。newTab（一覧の ⌘クリック・新しく作ったとき・チャットなどから来たとき）なら新しいタブ、
 * ふだんのクリックはピントのあるペインで表示中のメモを入れ替える（書きかけがあれば保存するかを聞く。メモのタブがなければ新しいタブ）
 */
export async function openMemoInPanel(projectId: number, path: string, newTab: boolean, key = memoPanelKey(projectId)): Promise<void> {
  const actions = panelActions(key);
  const state = panelStateOf(key);
  const tab = tabFor(projectId, path);
  if (state.tabs.some((t) => t.key === tab.key)) return actions.showTab(tab.key);
  const active = focusedPane(state.layout).active;
  const current = memoTabsOf(key).find((t) => t.key === active);
  if (newTab || !current) return actions.openMemo(tab);
  if (!(await confirmLeaveMemo(projectId, current.path))) return;
  actions.replaceTab(current.key, tab);
}

/** 名前を変えた・動かしたメモ（とフォルダの中のメモ）のタブを、新しいパスに付け替える */
export function remapMemoTabs(projectId: number, from: string, to: string) {
  for (const key of memoPanelKeys(projectId)) {
    const actions = panelActions(key);
    for (const t of memoTabsOf(key)) if (isUnder(t.path, from)) actions.replaceTab(t.key, tabFor(projectId, remapPath(t.path, from, to)));
  }
}

/** ゴミ箱に入れたメモ（フォルダならその中のメモ）のタブを閉じる */
export function closeMemoTabsUnder(projectId: number, path: string) {
  for (const key of memoPanelKeys(projectId)) {
    const actions = panelActions(key);
    for (const t of memoTabsOf(key)) if (isUnder(t.path, path)) actions.closeTab(t.key);
  }
}
