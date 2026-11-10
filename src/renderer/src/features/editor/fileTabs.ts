// プロジェクトの「ファイル」「検索」「変更」タブの右（パネルの files。開いたファイル・差分をタブで並べ、ドラッグで上下・左右に分けられる）の操作
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import { focusedPane } from "@/features/panel/layout/paneTree";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelStateOf } from "@/features/panel/state/panelStore";
import { baseName } from "@/lib/format";
import { choiceDialog } from "@/ui/dialogs";
import { startDragGhost } from "@/ui/dragGhost";
import { beginExternalTabDrag, endExternalTabDrag, EXTERNAL_TAB_MIME } from "@/features/panel/layout/externalTabDrag";
import { useCallback, useSyncExternalStore, type DragEvent } from "react";
import type { Selection } from "./fileSelection";

export type FileTab = Extract<PanelTab, { kind: "projectFile" }>;

const isFileTab = (t: PanelTab): t is FileTab => t.kind === "projectFile";
const isUnder = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

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

// 保存していない変更のあるタブ（欄の覚える名前とタブのキー。FileView の onDirtyChange から）。タブの「●」が読むので、変わったら知らせる
const dirtyTabs = new Set<string>();
const dirtyListeners = new Set<() => void>();
const dirtyId = (panelKey: string, tabKey: string) => `${panelKey}\n${tabKey}`;

export function setFileTabDirty(panelKey: string, tabKey: string, dirty: boolean) {
  const id = dirtyId(panelKey, tabKey);
  if (dirty === dirtyTabs.has(id)) return;
  if (dirty) dirtyTabs.add(id);
  else dirtyTabs.delete(id);
  for (const listener of dirtyListeners) listener();
}

const isDirty = (panelKey: string, tabKey: string) => dirtyTabs.has(dirtyId(panelKey, tabKey));
const fileTabsOf = (panelKey: string) => panelStateOf(panelKey).tabs.filter(isFileTab);

const subscribeDirty = (listener: () => void) => {
  dirtyListeners.add(listener);
  return () => void dirtyListeners.delete(listener);
};

/** そのタブに保存していない変更があるか（タブの × の代わりに「●」を出す。VS Code と同じ） */
export function useFileTabDirty(panelKey: string, tabKey: string | null): boolean {
  const read = useCallback(() => tabKey !== null && isDirty(panelKey, tabKey), [panelKey, tabKey]);
  return useSyncExternalStore(subscribeDirty, read);
}

// タブの中身の保存のしかた（FileView の ⌘S と同じ。閉じる・入れ替える前の「保存」で呼ぶ）
const savers = new Map<string, () => Promise<boolean>>();

/** タブの中身の保存のしかたを知らせる（中身がなくなったら返した関数で外す） */
export function registerFileTabSaver(panelKey: string, tabKey: string, save: () => Promise<boolean>): () => void {
  const id = dirtyId(panelKey, tabKey);
  savers.set(id, save);
  return () => {
    if (savers.get(id) === save) savers.delete(id);
  };
}

/**
 * 保存していない変更があれば、VS Code と同じく 保存 / 保存しない / キャンセル を選んでもらう（ないならそのまま true）。
 * 保存なら保存できたときだけ、保存しないなら印を外して true。キャンセル・保存できなかった（上書きをやめたなど）なら false
 */
async function confirmLeave(panelKey: string, tab: FileTab, action: "開く" | "閉じる"): Promise<boolean> {
  if (!isDirty(panelKey, tab.key)) return true;
  const picked = await choiceDialog({
    title: `「${baseName(tab.path)}」への変更を保存しますか？`,
    message: action === "開く" ? "このタブで別のファイルを開きます。保存しないと、変更は消えます。" : "保存しないと、変更は消えます。",
    choices: [
      { value: "discard", label: "保存しない" },
      { value: "save", label: "保存", primary: true },
    ],
  });
  if (picked === null) return false;
  if (picked === "save") return (await savers.get(dirtyId(panelKey, tab.key))?.()) ?? false;
  setFileTabDirty(panelKey, tab.key, false);
  return true;
}

/** タブを閉じてよいか（×。保存していない変更があれば、保存するかを聞く） */
export async function confirmCloseFileTab(panelKey: string, tabKey: string): Promise<boolean> {
  const tab = fileTabsOf(panelKey).find((t) => t.key === tabKey);
  return !tab || confirmLeave(panelKey, tab, "閉じる");
}

/**
 * ファイルを開く（メモのタブと同じ開き方）。開いていればそのタブを表示する（検索の別の行・差分の「編集」なら、そのタブの中身を替える）。
 * newTab（一覧の ⌘クリック・新しく作ったとき・チャットから来たとき）なら新しいタブ、ふだんはピントのあるペインで表示中のファイルを入れ替える
 * （保存していない変更があれば保存するかを聞く。表示中がファイルでなければ新しいタブ）
 */
export async function openFileTab(panelKey: string, projectId: number, sel: Selection, newTab: boolean): Promise<void> {
  const actions = panelActions(panelKey);
  const tab = fileTabOf(projectId, sel);
  const tabs = fileTabsOf(panelKey);
  const existing = tabs.find((t) => t.key === tab.key);
  if (existing) {
    if (existing.line !== tab.line || Boolean(existing.edit) !== Boolean(tab.edit)) {
      if (!(await confirmLeave(panelKey, existing, "開く"))) return;
      actions.replaceTab(existing.key, tab);
    }
    return actions.showTab(tab.key);
  }
  const current = tabs.find((t) => t.key === focusedPane(panelStateOf(panelKey).layout).active);
  if (newTab || !current) return actions.openPanelTab(tab);
  if (!(await confirmLeave(panelKey, current, "開く"))) return;
  actions.replaceTab(current.key, tab);
}

/** 名前を変えたファイル・フォルダ（from）のタブを、新しいパス（to）に付け替える（確かめない。先に保存してもらっている） */
export function relocateFileTabs(panelKey: string, projectId: number, from: string, to: string) {
  const actions = panelActions(panelKey);
  for (const t of fileTabsOf(panelKey)) {
    if (!isUnder(t.path, from)) continue;
    setFileTabDirty(panelKey, t.key, false);
    actions.replaceTab(t.key, fileTabOf(projectId, { ...selectionOf(t), path: to + t.path.slice(from.length) }));
  }
}

/** ゴミ箱に入れたファイル・フォルダ（path）のタブを閉じる（確かめない。保存していない変更も捨てる） */
export function closeFileTabsUnder(panelKey: string, path: string) {
  const actions = panelActions(panelKey);
  for (const t of fileTabsOf(panelKey)) {
    if (!isUnder(t.path, path)) continue;
    setFileTabDirty(panelKey, t.key, false);
    actions.closeTab(t.key);
  }
}

/** 保存していない変更のあるタブのファイル（名前の変更・ゴミ箱・置換の前に確かめる） */
export const dirtyFilePaths = (panelKey: string): string[] => fileTabsOf(panelKey).filter((t) => isDirty(panelKey, t.key)).map((t) => t.path);

/** そのファイル・フォルダの中の、保存していない変更のあるタブのファイル（なければ null） */
export const dirtyFileUnder = (panelKey: string, path: string): string | null => dirtyFilePaths(panelKey).find((p) => isUnder(p, path)) ?? null;

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
