import { createContext, useContext } from "react";
import { useDragWidth } from "../../hooks/useDragWidth";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { useSidePanel } from "../sidePanel/useSidePanel";

export type ProjectChatController = ReturnType<typeof useProjectChat>;

/** プロジェクトのチャット欄（App が持つ）。ボードが、欄で書いている途中の新しいチャットも「下書き」に出すのに使う */
export const ProjectChatContext = createContext<ProjectChatController | null>(null);
export const useProjectChatContext = () => useContext(ProjectChatContext);

/**
 * プロジェクトのチャット欄（画面の右端。どのタブでも開ける。Cursor・VS Code の右のチャットと同じ）の状態。
 * 中身はボードの右のパネルと同じタブ（チャット・新しいチャット・ブラウザ・ターミナル。useSidePanel）。
 * 開いているかはプロジェクトごと（localStorage）、タブはプロジェクトごと（アプリを閉じるまで）、幅はアプリ全体で覚える。⌥⌘B で開閉。
 * 画面の右端に、下のパネル（ターミナル）より下まで置く（App）。projectId がない画面（全プロジェクト）では出さない
 */
export function useProjectChat(projectId: number | undefined) {
  const openMap = useStoredFlagMap("kickoff:project-chat-open:");
  const open = projectId !== undefined && openMap.get(projectId);
  const panel = useSidePanel({ memoryKey: `side:${projectId ?? "none"}` });
  const width = useDragWidth({ storageKey: "kickoff:project-chat-width", initial: 420, min: 320, keep: 480, side: "right" });

  /** 開閉。開くときにタブがなければ、新しいチャットを開く */
  const toggle = () => {
    if (projectId === undefined) return;
    if (!open && panel.tabs.length === 0) panel.openNew({ projectId });
    openMap.set(projectId, !open);
  };

  useWindowEvent(
    "keydown",
    (e) => {
      if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "KeyB") {
        e.preventDefault();
        toggle();
      }
    },
    projectId !== undefined,
  );

  return {
    projectId,
    open,
    toggle,
    /** 欄を開いて、そのタブを表示する（ボードの下書きを押したとき） */
    showTab: (key: string) => {
      if (projectId !== undefined) openMap.set(projectId, true);
      panel.showTab(key);
    },
    close: () => projectId !== undefined && openMap.set(projectId, false),
    panel,
    width,
  };
}
