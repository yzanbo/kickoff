import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderOpen,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  SquarePen,
  Tag,
  Tags,
  Trash2,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { collectTags, MAX_TAG_LENGTH, MAX_TAGS, normalizeTags } from "@shared/project/tags";
import type { ProjectSummary } from "@shared/types";
import { alertDialog, promptDialog } from "@/ui/dialogs";
import { changeProject, confirmArchiveProject, confirmRestoreProject } from "./projectOrder";
import { useProjects } from "@/app/projectsContext";
import { openNewChat } from "@/app/router";
import { ProjectEditDialog } from "@/features/project/settings/ProjectEditDialog";
import type { ProjectSettingsSection } from "@/features/project/settings/ProjectSettings";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";

/** 開いた場所によって使える操作（見出しのカードから開いたときだけ渡す） */
export interface ProjectMenuExtras {
  /** グループを作り始める（チャット一覧に名前の入力欄を出す） */
  onCreateGroup?: () => void;
  /** チャット一覧の開閉 */
  collapse?: { collapsed: boolean; toggle: () => void };
}

/**
 * プロジェクトの右クリックメニュー（サイドバーの見出しのカード・下の丸）。プロジェクトに対する操作をすべて、まとまりに分けて並べる:
 * このプロジェクト（新しいチャット・グループを作成・Finder。カンバンは名前を押せば開く）/ 整理（固定・開閉・アーカイブ）/
 * タグ（使っているタグの付け外しと、新しいタグ）/ 編集・削除（プロジェクトの編集のダイアログ）。
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

/** メニューの高さの目安（画面の下にはみ出さない位置に出す。画面より高いときはメニューの中でスクロール）。タグの項目の分は足す */
const MENU_HEIGHT = 400;

/** 新しいタグの名前を聞いて付ける（やめたら何もしない。上限を超えるならお知らせ） */
async function addNewTag(project: ProjectSummary) {
  if (project.tags.length >= MAX_TAGS) return alertDialog("タグを足せません", `1 つのプロジェクトに付けられるタグは ${MAX_TAGS} 個までです。`);
  const name = await promptDialog({
    title: `「${project.name}」に新しいタグを付ける`,
    label: "タグの名前",
    placeholder: "例: 仕事・プライベート・クライアント A",
    confirmLabel: "付ける",
  });
  if (!name) return;
  if (name.length > MAX_TAG_LENGTH) return alertDialog("タグを付けられません", `タグは ${MAX_TAG_LENGTH} 文字までです。`);
  changeProject(project.id, { tags: normalizeTags([...project.tags, name]) });
}

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
  // 使っているタグ（ほかのプロジェクトの分も。押すたびに付け外す）
  const { projects } = useProjects();
  const tags = collectTags(projects);
  const at = clampToViewport(x, y, 260, MENU_HEIGHT + Math.min(tags.length, 8) * 34);
  /** 押したらメニューを閉じてから行う */
  const item = (key: string, icon: ReactNode, label: string, run: () => void, opts: { danger?: boolean } = {}) => (
    <MenuItem key={key} danger={opts.danger} onSelect={run}>
      {icon} {label}
    </MenuItem>
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
      <div className="menu-label">タグ</div>
      {tags.map((tag) => {
        const on = project.tags.includes(tag);
        return (
          <MenuItem
            key={`tag:${tag}`}
            role="menuitemcheckbox"
            checked={on}
            onSelect={() => changeProject(project.id, { tags: on ? project.tags.filter((t) => t !== tag) : [...project.tags, tag] })}
          >
            <Tag size={14} /> <span className="project-switch-item">{tag}</span>
            {on && <Check size={14} aria-hidden />}
          </MenuItem>
        );
      })}
      {item("new-tag", <Tags size={14} />, "新しいタグ…", () => void addNewTag(project))}

      <div className="menu-separator" role="separator" />
      {item("edit", <Pencil size={14} />, "編集…", () => onEdit())}
      {item("delete", <Trash2 size={14} />, "削除…", () => onEdit("danger"), { danger: true })}
    </PopupMenu>
  );
}
