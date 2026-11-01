import type { Project } from "../../../core/types";
import { useModalDialog } from "../hooks/useModalDialog";
import { CloseButton } from "./IconButton";
import { ProjectSettings } from "./projectSettings/ProjectSettings";

/** プロジェクト名の横の「編集」から開く、プロジェクトの設定（画面は移らない） */
export function ProjectEditDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  // 開いた直後に ✕ ボタンへピントが当たって枠が出ないよう、ダイアログ自体にピントを置く
  const dialog = useModalDialog({ focusSelf: true });

  return (
    <dialog
      ref={dialog.ref}
      className="dialog project-edit-dialog"
      tabIndex={-1}
      onClose={onClose}
      {...dialog.backdropProps}
    >
      <header className="project-edit-head">
        <h2>プロジェクトを編集</h2>
        <CloseButton title="閉じる（Esc）" size={16} onClick={dialog.close} />
      </header>
      <div className="project-edit-body">
        <ProjectSettings project={project} />
      </div>
    </dialog>
  );
}
