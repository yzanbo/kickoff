import { CloseButton } from "@/ui/IconButton";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useVisibleProjects } from "./useVisibleProjects";
import { NoProjectsWelcome } from "./ProjectsEmpty";

/**
 * プロジェクトがないのに新しいチャットを始めようとしたときの案内（App が出す。openNoProjectsGuide）。
 * 全プロジェクトの画面の空のときと同じ案内（NoProjectsWelcome）を、新しいチャット向けの文にしてダイアログで出す。
 * 作る・取り込むを押すと、これを閉じて新しいプロジェクトのダイアログを開く（作ると、そのプロジェクトで新しいチャットが開く）
 */
export function NoProjectsGuide({ onClose }: { onClose: () => void }) {
  // 開いた直後に ✕ ボタンへピントが当たって枠が出ないよう、ダイアログ自体にピントを置く
  const dialog = useModalDialog({ focusSelf: true });
  const { archived } = useVisibleProjects();
  return (
    <dialog ref={dialog.ref} className="dialog no-projects-guide" tabIndex={-1} aria-label="チャットはプロジェクトの中で始めます" onClose={onClose} {...dialog.backdropProps}>
      <CloseButton title="閉じる（Esc）" size={16} className="no-projects-guide-close" onClick={dialog.close} />
      <NoProjectsWelcome archived={archived.length} forNewChat onPick={dialog.close} />
    </dialog>
  );
}
