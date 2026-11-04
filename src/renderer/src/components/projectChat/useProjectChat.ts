import { createContext, useContext, useEffect, useRef } from "react";
import { useDragWidth } from "../../hooks/useDragWidth";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { PROJECT_CHAT_OPEN_PREFIX, PROJECT_CHAT_WIDTH_KEY } from "../../storageKeys";
import { registerPanel } from "../sidePanel/panelMemory";
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
  const openMap = useStoredFlagMap(PROJECT_CHAT_OPEN_PREFIX);
  const open = projectId !== undefined && openMap.get(projectId);
  const panel = useSidePanel({ memoryKey: `side:${projectId ?? "none"}`, scope: projectId ?? null, surface: "side" });
  const width = useDragWidth({ storageKey: PROJECT_CHAT_WIDTH_KEY, initial: 367, min: 320, keep: 480, side: "right", cssVar: "--chat-w" });

  /** 欄を開いて、そのタブを表示する（ボード・サイドバーの下書きを押したとき） */
  const showTab = (key: string) => {
    if (projectId !== undefined) openMap.set(projectId, true);
    panel.showTab(key);
  };
  // サイドバーの下書きからは、欄ごと開いて表示する（パネルの登録より後に登録して、こちらを優先する）
  const actionsRef = useRef({ show: showTab, close: panel.closeTab, update: panel.updateTab });
  actionsRef.current = { show: showTab, close: panel.closeTab, update: panel.updateTab };
  useEffect(
    () =>
      registerPanel(`side:${projectId ?? "none"}`, {
        show: (key) => actionsRef.current.show(key),
        close: (key) => actionsRef.current.close(key),
        update: (key, change) => actionsRef.current.update(key, change),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  /** 開閉。開くときに見せているタブがなく、チャットを表示する欄なら、新しいチャットを開く（初めはブラウザ・ターミナルだけなので開かない） */
  const toggle = () => {
    if (projectId === undefined) return;
    if (!open && panel.kinds.has("chat") && !panel.tabs.some((t) => panel.isKindShown(t.key))) panel.openNew({ projectId });
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
    showTab,
    close: () => projectId !== undefined && openMap.set(projectId, false),
    panel,
    width,
  };
}
