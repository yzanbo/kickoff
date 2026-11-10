import { useEffect, useMemo } from "react";
import type { TerminalTarget } from "@/features/panel/tabs/panelTypes";
import { focusedPane } from "@/features/panel/layout/paneTree";
import type { PanelScope } from "@/features/panel/surfaces";
import { usePanel } from "@/features/panel/usePanel";
import type { Selection } from "./fileSelection";
import { closeFileTabsUnder, dirtyFilePaths, dirtyFileUnder, openFileTab, relocateFileTabs, selectionOf } from "./fileTabs";

const NO_TERMINALS: readonly TerminalTarget[] = [];

/**
 * ファイル・検索・変更のタブの右の、開いたファイルをタブで並べるパネル（files。メモのタブの右と同じく、タブのドラッグ・右クリック・⌘\ で上下・左右に分けられる）と、
 * 左の一覧から開く操作。選んでいるファイル（selected）は、ピントのあるペインで表示中のタブ。scope はプロジェクト（チャットの右の欄の「ファイル」タブの中は、その部品ごとの名前）
 */
export function useFileTabs(projectId: number, scope: PanelScope) {
  const panel = usePanel({ surface: "files", scope, newChat: undefined, terminals: NO_TERMINALS });
  const { panelOpen, setOpen, key } = panel;
  // 右の欄はいつも開いておく（タブがなければ案内）
  useEffect(() => {
    if (!panelOpen) setOpen(true);
  }, [panelOpen, setOpen]);
  const focused = panel.tabs.find((t) => t.key === focusedPane(panel.layout).active);
  const selected = useMemo(() => (focused?.kind === "projectFile" ? selectionOf(focused) : undefined), [focused]);
  return {
    panel,
    /** 選んでいるファイル（ピントのあるペインで表示中のタブ。左の一覧の選んでいる行） */
    selected,
    /** ファイルを開く（newTab = ⌘クリック・新しく作ったとき・チャットから来たとき。確かめてやめることがあるので async。画面からは void で呼ぶ） */
    setSelected: (next: Selection, newTab = false) => openFileTab(key, projectId, next, newTab),
    /** そのファイル・フォルダの中の、保存していない変更のあるタブのファイル（名前を変える・ゴミ箱に入れる前に確かめる。なければ null） */
    dirtyUnder: (path: string) => dirtyFileUnder(key, path),
    /** 保存していない変更のあるタブのファイル（置換の前に確かめる） */
    dirtyPaths: () => dirtyFilePaths(key),
    /** 名前を変えたファイル・フォルダ（from）のタブを、新しいパス（to）に付け替える */
    relocate: (from: string, to: string) => relocateFileTabs(key, projectId, from, to),
    /** ゴミ箱に入れたファイル・フォルダ（path）のタブを閉じる */
    forget: (path: string) => closeFileTabsUnder(key, path),
  };
}

export type ChangesSelection = ReturnType<typeof useFileTabs>;
