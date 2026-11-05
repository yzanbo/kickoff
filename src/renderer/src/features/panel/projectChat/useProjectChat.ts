import { useDragSize } from "@/hooks/useDragSize";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { PROJECT_CHAT_WIDTH } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { usePanelOpen } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";

export type ProjectChatController = ReturnType<typeof useProjectChat>;

/**
 * プロジェクトのチャット欄（画面の右端。どのタブでも開ける。Cursor・VS Code の右のチャットと同じ）の殻: 開閉・幅・⌥⌘B。App が持つ。
 * 中身はボードの右のパネルと同じタブ（チャット・新しいチャット・ブラウザ・ターミナル。ProjectChat の中の usePanel）。
 * 開いているかはプロジェクトごと（localStorage）、タブはプロジェクトごと（アプリを閉じるまで）、幅はアプリ全体で覚える。
 * 画面の右端に、下のパネル（ターミナル）より下まで置く（App）。全プロジェクトの画面では、App がサイドバーで最後に選んでいたプロジェクト（もうなければ先頭）を渡し、
 * チャットは出さない（noChat。ターミナルとブラウザだけ。チャットのタブは閉じずに隠し、そのプロジェクトの画面ではそのまま出る）。projectId がない（プロジェクトが 1 つもない）ときは出さない
 */
export function useProjectChat(projectId: number | undefined, { noChat = false }: { noChat?: boolean } = {}) {
  const key = projectId === undefined ? undefined : panelKey("side", projectId);
  const open = usePanelOpen(key);
  // 幅（左端のつまみのドラッグ。真ん中に 480px は残す）
  const width = useDragSize({ setting: PROJECT_CHAT_WIDTH, edge: "start", min: 320, keep: 480, write: "--chat-w" });

  /** 開閉（開くときに見せているタブがなく、チャットを表示する欄なら、新しいチャットを開く。初めはブラウザ・ターミナルだけなので開かない） */
  const toggle = () => {
    if (key) panelActions(key).toggle({ noChat });
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

  return { projectId, open, toggle, width, noChat };
}
