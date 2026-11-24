// プロジェクトの「ノート」タブの右の欄（パネルの notes。開いたノートをタブで並べ、ドラッグで上下・左右に分けられる）の操作
import { isUnder, remapPrefix } from "@shared/foundation/path";
import { noteTab, openInFocusedPane, panelKey, type PanelScope, type PanelTab, type ViewScope } from "@/features/panel/ui";
import { confirmLeaveNote } from "./noteLeave";

/** 右サイドバーのノートの右のタブの欄の範囲（真ん中のノートのタブとは別に覚える） */
export const sideNoteScope = (projectId: number): ViewScope => `view-side-${projectId}`;

/** ノートのタブの右の欄の覚える名前（プロジェクトごと。scope を渡せばその範囲 = 右サイドバーのノート） */
export const notePanelKey = (projectId: number, scope?: PanelScope) => panelKey("notes", scope ?? projectId);

type NoteTab = Extract<PanelTab, { kind: "note" }>;

/**
 * 名前を変えた・動かしたノート（フォルダならその中のノート）のタブの付け替え（パネルの mapTabs に渡す。ノートのタブの右・右サイドバー・チャットの右の欄のどれでも。
 * チャットの右の欄のタブはそのチャットに付けたまま）
 */
export const movedNoteTab = (projectId: number, from: string, to: string) => (t: NoteTab): NoteTab =>
  t.projectId === projectId && isUnder(t.path, from) ? noteTab({ chatId: t.chatId, projectId, path: remapPrefix(t.path, from, to) }) : t;

/** ゴミ箱に入れたノート（フォルダならその中のノート）のタブを閉じる（パネルの mapTabs に渡す。どの欄でも） */
export const trashedNoteTab = (projectId: number, path: string) => (t: NoteTab): NoteTab | null => (t.projectId === projectId && isUnder(t.path, path) ? null : t);

/**
 * ノートを開く（パネルの openInFocusedPane）。開いていればそのタブを表示する。newTab（一覧の ⌘クリック・新しく作ったとき・チャットなどから来たとき）なら新しいタブ、
 * ふだんのクリックはピントのあるペインで表示中のノートを入れ替える（書きかけがあれば保存するかを聞く。ノートのタブがなければ新しいタブ）
 */
export function openNoteInPanel(projectId: number, path: string, newTab: boolean, key = notePanelKey(projectId)): Promise<void> {
  // タブの中身（チャットなし = 開いたチャットへの添付はない）
  return openInFocusedPane(key, noteTab({ chatId: null, projectId, path }), { newTab, confirmReplace: (current) => confirmLeaveNote(projectId, current.path) });
}
