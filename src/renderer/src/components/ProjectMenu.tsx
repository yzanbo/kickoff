import { Archive, ArchiveRestore, Pin, PinOff } from "lucide-react";
import { useRef } from "react";
import type { Project } from "../../../core/types";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { changeProject } from "../projectOrder";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/**
 * プロジェクトの右クリックメニュー（サイドバーのプロジェクトのカード・下の丸）: 上に固定する・しまう（アーカイブ）。
 * しまったプロジェクトは、サイドバー（下の行の切り替えで出せる）・切り替え・全プロジェクトの画面に出なくなる（見出しの名前のメニューの「アーカイブ済み」から開ける）
 */
export function ProjectMenu({ x, y, project, onClose }: { x: number; y: number; project: Pick<Project, "id" | "name" | "pinned" | "archived_at">; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  const at = clampToViewport(x, y, 220, 100);
  const update = (patch: { pinned?: boolean; archived?: boolean }) => {
    onClose();
    changeProject(project.id, patch);
  };
  return (
    <PopupMenu x={at.x} y={at.y} label={`${project.name} のメニュー`} menuRef={ref} onClose={onClose}>
      <button role="menuitem" onClick={() => update({ pinned: !project.pinned })}>
        {project.pinned ? <PinOff size={14} /> : <Pin size={14} />} {project.pinned ? "固定をやめる" : "上に固定"}
      </button>
      <button role="menuitem" onClick={() => update({ archived: !project.archived_at })}>
        {project.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />} {project.archived_at ? "アーカイブから戻す" : "アーカイブ（しまう）"}
      </button>
    </PopupMenu>
  );
}
