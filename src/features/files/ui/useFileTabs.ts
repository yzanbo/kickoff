import { useMemo } from "react";
import { focusedPane } from "@/features/panel/ui/layout/paneTree";
import type { PanelScope } from "@/features/panel/ui";
import { usePanel } from "@/features/panel/ui/usePanel";
import type { Selection } from "@/features/git/ui/changes/fileSelection";
import { closeFileTabsUnder, dirtyFilePaths, dirtyFileUnder, openFileTab, relocateFileTabs, selectionOf } from "./fileTabs";


/**
 * ファイル・検索・変更のタブの右の、開いたファイルをタブで並べるパネル（files。ノートのタブの右と同じく、タブのドラッグ・右クリック・⌘\ で上下・左右に分けられる）と、
 * 左の一覧から開く操作。選んでいるファイル（selected）は、ピントのあるペインで表示中のタブ。scope はプロジェクト（チャットの右の欄の「ファイル」タブの中は、その部品ごとの名前）
 */
export function useFileTabs(projectId: number, scope: PanelScope) {
  // 右の欄はいつも開いておく（タブがなければ案内。欄の決まりの alwaysOpen）
  const panel = usePanel("files", scope);
  const { key } = panel;
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
