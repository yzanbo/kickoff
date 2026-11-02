import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Pencil,
  Pin,
  PinOff,
  Rows2,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ProjectSummary } from "../../../../core/types";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { useSharedChoice, useSharedFlag } from "../../hooks/useStoredState";
import { changeProject } from "../../projectOrder";
import { navigate, openNewChat } from "../../router";
import { ProjectEditDialog } from "../ProjectEditDialog";
import type { ProjectSettingsSection } from "../projectSettings/ProjectSettings";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import { CHAT_GROUPINGS, GROUPING_META, type ChatGrouping } from "./ChatGroupingMenu";
import { COMPACT_KEY, GROUPING_KEY, SHOW_ARCHIVED_KEY } from "./sidebarFlags";

/** 開いた場所によって使える操作（見出しのカードから開いたときだけ渡す） */
export interface ProjectMenuExtras {
  /** グループを作り始める（チャット一覧に名前の入力欄を出す） */
  onCreateGroup?: () => void;
  /** チャット一覧の開閉 */
  collapse?: { collapsed: boolean; toggle: () => void };
}

/**
 * プロジェクトの右クリックメニュー（サイドバーの見出しのカード・下の丸）。プロジェクトに対する操作をすべて、まとまりに分けて並べる:
 * このプロジェクト（カンバン・新しいチャット・グループを作成・Finder）/ 整理（固定・開閉・アーカイブ）/
 * チャットの表示（並べ方・アーカイブ済み・1 行。どのプロジェクトでも同じ）/ 編集・削除（プロジェクトの編集のダイアログ）。
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
const MENU_HEIGHT = 640;

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
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  const [grouping, setGrouping] = useSharedChoice<ChatGrouping>(GROUPING_KEY, CHAT_GROUPINGS, "recent");
  const [showArchived, setShowArchived] = useSharedFlag(SHOW_ARCHIVED_KEY);
  const [compact, setCompact] = useSharedFlag(COMPACT_KEY);
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
  const check = (key: string, role: "menuitemradio" | "menuitemcheckbox", icon: ReactNode, label: string, checked: boolean, run: () => void) => (
    <button
      key={key}
      role={role}
      aria-checked={checked}
      onClick={() => {
        onClose();
        run();
      }}
    >
      {icon}
      <span className="project-switch-item">{label}</span>
      {checked && <Check size={14} aria-hidden />}
    </button>
  );
  const archived = Boolean(project.archived_at);
  return (
    <PopupMenu x={at.x} y={at.y} className="project-menu" label={`${project.name} のメニュー`} menuRef={ref} onClose={onClose}>
      <div className="menu-label">このプロジェクト</div>
      {item("board", <LayoutGrid size={14} />, "カンバンを開く", () => navigate({ name: "project", id: project.id, tab: "board" }))}
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
      {item("archive", archived ? <ArchiveRestore size={14} /> : <Archive size={14} />, archived ? "アーカイブから戻す" : "アーカイブ（しまう）", () =>
        changeProject(project.id, { archived: !archived }),
      )}

      <div className="menu-separator" role="separator" />
      <div className="menu-label">チャットの表示（すべてのプロジェクト）</div>
      {CHAT_GROUPINGS.map((g) => {
        const Icon = GROUPING_META[g].icon;
        return check(g, "menuitemradio", <Icon size={14} aria-hidden />, GROUPING_META[g].label, g === grouping, () => setGrouping(g));
      })}
      {check("archived", "menuitemcheckbox", <Archive size={14} aria-hidden />, "アーカイブ済みを表示", showArchived, () => setShowArchived(!showArchived))}
      {check("compact", "menuitemcheckbox", <Rows2 size={14} aria-hidden />, "1 行で表示", compact, () => setCompact(!compact))}

      <div className="menu-separator" role="separator" />
      {item("edit", <Pencil size={14} />, "編集…", () => onEdit())}
      {item("delete", <Trash2 size={14} />, "削除…", () => onEdit("danger"), { danger: true })}
    </PopupMenu>
  );
}
