import { useServerEvent } from "../../events";
import { useDragWidth } from "../../hooks/useDragWidth";
import { useStoredFlagMap, useStoredState } from "../../hooks/useStoredState";
import { useWindowEvent } from "../../hooks/useWindowEvent";

export type ProjectChatController = ReturnType<typeof useProjectChat>;

/**
 * プロジェクトのチャット欄（画面の右端。どのタブでも開ける、AI と話すチャット 1 つ。Cursor・VS Code の右のチャットと同じ）の状態。
 * 開いているか・表示しているチャット・幅は、プロジェクトごとに覚える。⌥⌘B で開閉。
 * ボードの右のパネル（カードを開く）とは別のもの
 */
export function useProjectChat(projectId: number) {
  const openMap = useStoredFlagMap("kickoff:project-chat-open:");
  const open = openMap.get(projectId);
  const setOpen = (value: boolean) => openMap.set(projectId, value);
  // 表示しているチャット（なければ新しいチャットを書く画面）
  const [runId, setRunId] = useStoredState<number | null>(
    `kickoff:project-chat:${projectId}`,
    (raw) => Number(raw) || null,
    (value) => (value === null ? "" : String(value)),
  );
  const width = useDragWidth({ storageKey: "kickoff:project-chat-width", initial: 420, min: 320, keep: 480, side: "right" });

  // 表示していたチャットが消えたら、新しいチャットにする
  useServerEvent((e) => {
    if (e.type === "run_deleted" && e.id === runId) setRunId(null);
  });

  useWindowEvent("keydown", (e) => {
    if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "KeyB") {
      e.preventDefault();
      setOpen(!open);
    }
  });

  return {
    projectId,
    open,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    runId,
    /** 新しいチャットを書く画面にする */
    startNew: () => setRunId(null),
    showRun: setRunId,
    width,
  };
}
