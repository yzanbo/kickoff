import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Project } from "../../../core/types";
import { ProjectSettings } from "./ProjectSettings";

/** プロジェクト名の横の「編集」から開く、プロジェクトの設定（画面は移らない） */
export function ProjectEditDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    // 開いた直後に ✕ ボタンへピントが当たって枠が出ないよう、ダイアログ自体にピントを置く
    ref.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog project-edit-dialog"
      tabIndex={-1}
      onClose={onClose}
      // 外側（背景）を押したら閉じる
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      <header className="project-edit-head">
        <h2>プロジェクトを編集</h2>
        <button className="icon-button" title="閉じる（Esc）" aria-label="閉じる" onClick={() => ref.current?.close()}>
          <X size={16} />
        </button>
      </header>
      <div className="project-edit-body">
        <ProjectSettings project={project} />
      </div>
    </dialog>
  );
}
