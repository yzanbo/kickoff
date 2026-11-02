import {
  Archive,
  ArchiveRestore,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import type { ProjectSummary } from "../../../../core/types";
import { changeProject, confirmArchiveProject, confirmRestoreProject } from "../../projectOrder";
import { openNewChat } from "../../router";
import { ProjectEditDialog } from "../project/ProjectEditDialog";
import type { ProjectSettingsSection } from "../projectSettings/ProjectSettings";
import { clampToViewport, PopupMenu } from "../PopupMenu";

/** 開いた場所によって使える操作（見出しのカードから開いたときだけ渡す） */
export interface ProjectMenuExtras {
  /** グループを作り始める（チャット一覧に名前の入力欄を出す） */
  onCreateGroup?: () => void;
  /** チャット一覧の開閉 */
  collapse?: { collapsed: boolean; toggle: () => void };
}

/**
 * プロジェクトの右クリックメニュー（サイドバーの見出しのカード・下の丸）。プロジェクトに対する操作をすべて、まとまりに分けて並べる:
 * このプロジェクト（新しいチャット・グループを作成・Finder。カンバンは名前を押せば開く）/ 整理（固定・開閉・アーカイブ）/ 編集・削除（プロジェクトの編集のダイアログ）。
 * すべてのプロジェクトに効く設定（チャットの並べ方など）はここに入れず、一覧の上の見出しの行に置く。
 * 見出しのカードには、いつも使うもの（開閉・名前・状態ごとの数・＋）だけを常に出す。
 * open に右クリックのイベントを渡し、element を描く（メニューと編集のダイアログ）
 */
export function useProjectMenu(projects: ProjectSummary[]) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: number; extras?: ProjectMenuExtras } | null>(null);
  const [editing, setEditing] = useState<{ id: number; section?: ProjectSettingsSection } | null>(null);
  // 編集中に保存した内容も出るよう、いまのプロジェクトを引き直す
  const find = (id: number) => projects.find((p) => p.id === id);
  const menuProject = menu && find(menu.id);
  const editingProject = editing && find(editing.id);
  return {
    open: (e: MouseEvent, project: ProjectSummary, extras?: ProjectMenuExtras) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, id: project.id, extras });
    },
    element: (
      <>
        {menu && menuProject && (
          <ProjectMenu
            x={menu.x}
            y={menu.y}
            project={menuProject}
            extras={menu.extras}
            onEdit={(section) => setEditing({ id: menuProject.id, section })}
            onClose={() => setMenu(null)}
          />
        )}
        {editing && editingProject && <ProjectEditDialog project={editingProject} initial={editing.section} onClose={() => setEditing(null)} />}
      </>
    ),
  };
}

/** メニューの高さの目安（画面の下にはみ出さない位置に出す。画面より高いときはメニューの中でスクロール） */
const MENU_HEIGHT = 350;

function ProjectMenu({
  x,
  y,
  project,
  extras,
  onEdit,
  onClose,
}: {
  x: number;
  y: number;
  project: ProjectSummary;
  extras?: ProjectMenuExtras;
  onEdit: (section?: ProjectSettingsSection) => void;
  onClose: () => void;
}) {
  const at = clampToViewport(x, y, 260, MENU_HEIGHT);
  /** 押したらメニューを閉じてから行う */
  const item = (key: string, icon: ReactNode, label: string, run: () => void, opts: { danger?: boolean } = {}) => (
    <button
      key={key}
      role="menuitem"
      className={opts.danger ? "danger" : undefined}
      onClick={() => {
        onClose();
        run();
      }}
    >
      {icon} {label}
    </button>
  );
  const archived = Boolean(project.archived_at);
  return (
    <PopupMenu x={at.x} y={at.y} className="project-menu" label={`${project.name} のメニュー`} onClose={onClose}>
      <div className="menu-label">このプロジェクト</div>
      {item("new", <SquarePen size={14} />, "新しいチャット", () => openNewChat(project.id))}
      {extras?.onCreateGroup && item("group", <FolderPlus size={14} />, "グループを作成", extras.onCreateGroup)}
      {window.kickoff && item("finder", <FolderOpen size={14} />, "Finder で開く", () => void window.kickoff?.openPath(project.repo_path))}

      <div className="menu-separator" role="separator" />
      <div className="menu-label">整理</div>
      {!archived &&
        item("pin", project.pinned ? <PinOff size={14} /> : <Pin size={14} />, project.pinned ? "固定をやめる" : "上に固定", () =>
          changeProject(project.id, { pinned: !project.pinned }),
        )}
      {extras?.collapse &&
        item(
          "fold",
          extras.collapse.collapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />,
          extras.collapse.collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる",
          extras.collapse.toggle,
        )}
      {item("archive", archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, archived ? "アーカイブから戻す" : "アーカイブ", () =>
        // アーカイブするときも戻すときも確かめる
        void (archived ? confirmRestoreProject(project) : confirmArchiveProject(project)),
      )}

      <div className="menu-separator" role="separator" />
      {item("edit", <Pencil size={14} />, "編集…", () => onEdit())}
      {item("delete", <Trash2 size={14} />, "削除…", () => onEdit("danger"), { danger: true })}
    </PopupMenu>
  );
}
