import { useMemo } from "react";
import { focusedPane } from "@/features/panel/ui/layout/paneTree";
import { mapTabs, usePanel, type PanelScope } from "@/features/panel/ui";
import type { Selection } from "./tabSelection";
import { isUnder, remapPrefix } from "@shared/foundation/path";
import { dirtyFilePaths, dirtyFileUnder, fileTabOf, openFileTab, selectionOf, setFileTabDirty } from "./fileTabs";


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
    /** 名前を変えたファイル・フォルダ（from）のタブを、新しいパス（to）に付け替える（確かめない。先に保存してもらっている） */
    relocate: (from: string, to: string) =>
      mapTabs(
        "projectFile",
        (t) => {
          if (!isUnder(t.path, from)) return t;
          setFileTabDirty(key, t.key, false);
          return fileTabOf(projectId, { ...selectionOf(t), path: remapPrefix(t.path, from, to) });
        },
        [key],
      ),
    /** ゴミ箱に入れたファイル・フォルダ（path）のタブを閉じる（確かめない。保存していない変更も捨てる） */
    forget: (path: string) =>
      mapTabs(
        "projectFile",
        (t) => {
          if (!isUnder(t.path, path)) return t;
          setFileTabDirty(key, t.key, false);
          return null;
        },
        [key],
      ),
  };
}

export type ChangesSelection = ReturnType<typeof useFileTabs>;
