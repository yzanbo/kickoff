import { openPopout } from "@/app/popout";
import { useDragSize } from "@/hooks/useDragSize";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { useSetting } from "@/hooks/useSetting";
import { PROJECT_CHAT_MAXIMIZED, PROJECT_CHAT_WIDTH } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { usePanelOpen } from "@/features/panel/state/panelStore";
import { panelKey } from "@/features/panel/surfaces";

export type ProjectChatController = ReturnType<typeof useProjectChat>;

/**
 * プロジェクトのチャット欄（画面の右端。画面の文言では「右サイドバー」。どのタブでも開ける）の殻: 開閉・幅・⌥⌘B。App が持つ。
 * 中身はブラウザのタブ（ProjectChat の中の usePanel）と、右端のアイコンの列で選ぶプロジェクトの画面。
 * 開いているか・ブラウザのタブはプロジェクトごと（localStorage）、幅はアプリ全体で覚える。
 * 画面の右端に、下のパネル（ターミナル）より下まで置く（App）。全プロジェクトの画面では、App がサイドバーで最後に選んでいたプロジェクト（もうなければ先頭）を渡す。
 * projectId がない（プロジェクトが 1 つもない）ときは出さない
 */
export function useProjectChat(projectId: number | undefined, { inWindow = false }: { inWindow?: boolean } = {}) {
  const key = projectId === undefined ? undefined : panelKey("side", projectId);
  // 別ウィンドウへ移している間は、開いているものとして見せる（開閉の操作はそのウィンドウを前に出す）
  const open = usePanelOpen(key) || inWindow;
  // 幅（左端のつまみのドラッグ。真ん中に 480px は残す）
  const width = useDragSize({ setting: PROJECT_CHAT_WIDTH, edge: "start", min: 320, keep: 480, write: "--chat-w" });
  // 横幅いっぱい（左のサイドバーの右から画面の右端まで。真ん中の画面を覆う）
  const [maximized, setMaximized] = useSetting(PROJECT_CHAT_MAXIMIZED);

  /** 開閉（タブがなくても、開くだけ） */
  const toggle = () => {
    if (inWindow) return openSideWindow();
    if (key) panelActions(key).toggle();
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

  return { projectId, open, toggle, width, inWindow, maximized, setMaximized };
}

/** チャット欄の別ウィンドウを開く（もう開いていれば前に出す。チャット欄の状態は、開いた別ウィンドウにメインのウィンドウが渡す。app/popoutHosts.ts） */
export const openSideWindow = () => openPopout({ kind: "side" }, "右サイドバー");
