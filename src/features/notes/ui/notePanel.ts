// プロジェクトの「ノート」タブの右の欄（パネルの notes。開いたノートをタブで並べ、ドラッグで上下・左右に分けられる）の操作
import { noteTab, openInFocusedPane, panelKey, type PanelScope, type ViewScope } from "@/features/panel/ui";
import { confirmLeaveNote } from "./noteGuards";

/** 右サイドバーのノートの右のタブの欄の範囲（真ん中のノートのタブとは別に覚える） */
export const sideNoteScope = (projectId: number): ViewScope => `view-side-${projectId}`;

/** ノートのタブの右の欄の覚える名前（プロジェクトごと。scope を渡せばその範囲 = 右サイドバーのノート） */
export const notePanelKey = (projectId: number, scope?: PanelScope) => panelKey("notes", scope ?? projectId);

/** そのプロジェクトのノートのタブの欄すべて（真ん中のノートのタブと右サイドバー。名前の変更・ゴミ箱をどちらのタブにも効かせる。パネルの mapTabs に渡す） */
export const notePanelKeys = (projectId: number) => [notePanelKey(projectId), notePanelKey(projectId, sideNoteScope(projectId))];

/**
 * ノートを開く（パネルの openInFocusedPane）。開いていればそのタブを表示する。newTab（一覧の ⌘クリック・新しく作ったとき・チャットなどから来たとき）なら新しいタブ、
 * ふだんのクリックはピントのあるペインで表示中のノートを入れ替える（書きかけがあれば保存するかを聞く。ノートのタブがなければ新しいタブ）
 */
export function openNoteInPanel(projectId: number, path: string, newTab: boolean, key = notePanelKey(projectId)): Promise<void> {
  // タブの中身（チャットなし = 開いたチャットへの添付はない）
  return openInFocusedPane(key, noteTab({ chatId: null, projectId, path }), { newTab, confirmReplace: (current) => confirmLeaveNote(projectId, current.path) });
}
