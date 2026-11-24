// プロジェクトの「ファイル」「検索」「変更」タブの右（パネルの files。開いたファイル・差分をタブで並べ、ドラッグで上下・左右に分けられる）の操作
import { openInFocusedPane, panelStateOf, type PanelTab } from "@/features/panel/ui";
import { confirmLeave as confirmUnsavedLeave, hasUnsaved, useHasUnsaved, type UnsavedEntry } from "@/foundation/ui/document/unsaved";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { beginExternalTabDrag, endExternalTabDrag, EXTERNAL_TAB_MIME } from "@/features/panel/ui/layout/externalTabDrag";
import type { DragEvent } from "react";
import type { Selection } from "./tabSelection";

export type FileTab = Extract<PanelTab, { kind: "projectFile" }>;

const isFileTab = (t: PanelTab): t is FileTab => t.kind === "projectFile";
const fileTabsOf = (panelKey: string) => panelStateOf(panelKey).tabs.filter(isFileTab);

/**
 * タブのキー: 中身（エクスプローラー・検索の行から）はファイルごとに 1 つ（検索の別の行から開いても同じタブで、その行へ移る）。
 * 差分（変更の一覧から）はステージ済み・未ステージごとに 1 つ（VS Code と同じく、同じファイルの中身のタブとは別）
 */
export const fileTabKeyOf = (projectId: number, sel: Selection) =>
  sel.staged === undefined || sel.line !== undefined ? `pfile:${projectId}:${sel.path}` : `pdiff:${projectId}:${sel.staged ? "staged" : "unstaged"}:${sel.path}`;

/** 選択からタブを作る */
export const fileTabOf = (projectId: number, sel: Selection): FileTab => ({
  key: fileTabKeyOf(projectId, sel),
  kind: "projectFile",
  projectId,
  path: sel.path,
  ...(sel.staged !== undefined ? { staged: sel.staged } : {}),
  ...(sel.line !== undefined ? { line: sel.line } : {}),
  ...(sel.edit ? { edit: true } : {}),
  ...(sel.focus ? { focus: true } : {}),
});

/** タブの選択（中身の出し方） */
export const selectionOf = (t: FileTab): Selection => ({
  path: t.path,
  ...(t.staged !== undefined ? { staged: t.staged } : {}),
  ...(t.line !== undefined ? { line: t.line } : {}),
  ...(t.edit ? { edit: true } : {}),
  ...(t.focus ? { focus: true } : {}),
});

/** 未保存の登録簿の、タブの置き場所（欄の覚える名前とタブのキー。FileView が tab に入れる） */
export const fileTabPlace = (panelKey: string, tabKey: string) => `${panelKey}\n${tabKey}`;

const inTab = (panelKey: string, tabKey: string) => {
  const place = fileTabPlace(panelKey, tabKey);
  return (e: UnsavedEntry) => e.tab === place;
};

/** そのタブに保存していない変更があるか（作業場所を移したときに、書きかけのファイルのタブを付け替えずに残す） */
export const isFileTabDirty = (panelKey: string, tabKey: string) => hasUnsaved(inTab(panelKey, tabKey));

/** そのタブに保存していない変更があるか（タブの × の代わりに「●」を出す。VS Code と同じ） */
export function useFileTabDirty(panelKey: string, tabKey: string): boolean {
  return useHasUnsaved(inTab(panelKey, tabKey));
}

/**
 * 保存していない変更があれば、VS Code と同じく 保存 / 保存しない / キャンセル を選んでもらう（ないならそのまま true。未保存の登録簿の confirmLeave）。
 * 保存なら保存できたときだけ、保存しないなら書きかけを捨てて true。キャンセル・保存できなかった（ほかで変わっていたなど）なら false
 */
const confirmLeave = (panelKey: string, tab: FileTab, action: "開く" | "閉じる"): Promise<boolean> =>
  confirmUnsavedLeave(inTab(panelKey, tab.key), action === "開く" ? { action: "このタブで別のファイルを開きます。" } : {});

/** タブを閉じてよいか（×。保存していない変更があれば、保存するかを聞く） */
export async function confirmCloseFileTab(panelKey: string, tabKey: string): Promise<boolean> {
  const tab = fileTabsOf(panelKey).find((t) => t.key === tabKey);
  return !tab || confirmLeave(panelKey, tab, "閉じる");
}

/**
 * ファイルを開く（ノートのタブと同じ開き方。パネルの openInFocusedPane）。開いていればそのタブを表示する（検索の別の行・差分の「編集」なら、そのタブの中身を替える）。
 * newTab（一覧の ⌘クリック・新しく作ったとき・チャットから来たとき）なら新しいタブ、ふだんはピントのあるペインで表示中のファイルを入れ替える
 * （保存していない変更があれば保存するかを聞く。表示中がファイルでなければ新しいタブ）
 */
export function openFileTab(panelKey: string, projectId: number, sel: Selection, newTab: boolean): Promise<void> {
  const tab = fileTabOf(projectId, sel);
  return openInFocusedPane(panelKey, tab, {
    newTab,
    changed: (existing) => existing.line !== tab.line || Boolean(existing.edit) !== Boolean(tab.edit),
    confirmReplace: (current) => confirmLeave(panelKey, current, "開く"),
  });
}

/**
 * ファイルタブの木のファイルの行のドラッグ（VS Code と同じく、右のファイルのタブの欄へ落として開く。タブの列ならその位置、中身の端ならその側に分けて開く。
 * 落とす側はパネルのタブのドラッグと同じ useTabDrag）
 */
export const fileDragProps = (panelKey: string, projectId: number) => (path: string) => ({
  draggable: true as const,
  onDragStart: (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(EXTERNAL_TAB_MIME, path);
    e.dataTransfer.effectAllowed = "move";
    startDragGhost(e, { after: () => beginExternalTabDrag(panelKey, fileTabOf(projectId, { path })) });
  },
  onDragEnd: () => setTimeout(endExternalTabDrag, 0),
});
