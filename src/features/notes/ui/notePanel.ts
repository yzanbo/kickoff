// プロジェクトの「ノート」タブの右の欄（パネルの notes。開いたノートをタブで並べ、ドラッグで上下・左右に分けられる）の操作
import type { PanelTab } from "@/features/panel/ui/tabs/panelTypes";
import { focusedPane } from "@/features/panel/ui/layout/paneTree";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelStateOf } from "@/features/panel/ui/state/panelStore";
import { panelKey, type PanelScope, type ViewScope } from "@/features/panel/ui/surfaces";
import { noteTab } from "@/features/panel/ui/tabs/tabKinds";
import { confirmLeaveNote } from "./noteGuards";
import { isUnder, remapPath } from "./notePaths";

/** 右サイドバーのノートの右のタブの欄の範囲（真ん中のノートのタブとは別に覚える） */
export const sideNoteScope = (projectId: number): ViewScope => `view-side-${projectId}`;

/** ノートのタブの右の欄の覚える名前（プロジェクトごと。scope を渡せばその範囲 = 右サイドバーのノート） */
export const notePanelKey = (projectId: number, scope?: PanelScope) => panelKey("notes", scope ?? projectId);

/** そのプロジェクトのノートのタブの欄すべて（真ん中のノートのタブと右サイドバー。名前の変更・ゴミ箱をどちらのタブにも効かせる） */
const notePanelKeys = (projectId: number) => [notePanelKey(projectId), notePanelKey(projectId, sideNoteScope(projectId))];

type NotePanelTab = Extract<PanelTab, { kind: "note" }>;

const noteTabsOf = (key: string): NotePanelTab[] => panelStateOf(key).tabs.filter((t): t is NotePanelTab => t.kind === "note");

/** タブの中身（チャットなし = 開いたチャットへの添付はない） */
const tabFor = (projectId: number, path: string) => noteTab({ chatId: null, projectId, path });

/**
 * ノートを開く。開いていればそのタブを表示する。newTab（一覧の ⌘クリック・新しく作ったとき・チャットなどから来たとき）なら新しいタブ、
 * ふだんのクリックはピントのあるペインで表示中のノートを入れ替える（書きかけがあれば保存するかを聞く。ノートのタブがなければ新しいタブ）
 */
export async function openNoteInPanel(projectId: number, path: string, newTab: boolean, key = notePanelKey(projectId)): Promise<void> {
  const actions = panelActions(key);
  const state = panelStateOf(key);
  const tab = tabFor(projectId, path);
  if (state.tabs.some((t) => t.key === tab.key)) return actions.showTab(tab.key);
  const active = focusedPane(state.layout).active;
  const current = noteTabsOf(key).find((t) => t.key === active);
  if (newTab || !current) return actions.openNote(tab);
  if (!(await confirmLeaveNote(projectId, current.path))) return;
  actions.replaceTab(current.key, tab);
}

/** 名前を変えた・動かしたノート（とフォルダの中のノート）のタブを、新しいパスに付け替える */
export function remapNoteTabs(projectId: number, from: string, to: string) {
  for (const key of notePanelKeys(projectId)) {
    const actions = panelActions(key);
    for (const t of noteTabsOf(key)) if (isUnder(t.path, from)) actions.replaceTab(t.key, tabFor(projectId, remapPath(t.path, from, to)));
  }
}

/** ゴミ箱に入れたノート（フォルダならその中のノート）のタブを閉じる */
export function closeNoteTabsUnder(projectId: number, path: string) {
  for (const key of notePanelKeys(projectId)) {
    const actions = panelActions(key);
    for (const t of noteTabsOf(key)) if (isUnder(t.path, path)) actions.closeTab(t.key);
  }
}
