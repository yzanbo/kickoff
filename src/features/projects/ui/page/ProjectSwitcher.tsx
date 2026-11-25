import "./ProjectSwitcher.css";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { isUserProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { archivedProjects, sidebarOrder } from "@/features/projects/ui/projectOrder";
import { hueStyle, useProjectHue } from "@/features/projects/ui/projectColor";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { navigate, type ProjectViewId } from "@/foundation/ui/navigation/router";
import type { Placement } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { useTrashedProjects } from "@/features/trash/ui";
import { openSettings } from "@/features/settings/ui";

/** 全プロジェクトの画面の名前（サイドバーの項目と同じ） */
const ALL_PROJECTS = "全プロジェクト";

/**
 * 画面の見出しの名前（プロジェクトの画面と全プロジェクトの画面）。プロジェクトの印（ProjectMark）＋ 名前 ＋ プロジェクトの色の薄い地（サイドバー・バッジと同じ出し方。全プロジェクトは灰色）。
 * project がなければ全プロジェクト。押すと全プロジェクト・ほかのプロジェクトを選べ、プロジェクトどうしはいまのタブ（ボード・グループなど）のまま切り替わる
 * （全プロジェクトから選んだときはカンバン）。しまった（アーカイブした）プロジェクトは下の「アーカイブ済み」に分けて出す。
 * ゴミ箱に入れたプロジェクトがあれば、いちばん下に設定の「ゴミ箱と整理」（戻す口）への 1 行を出す。プロジェクトがなければ押せない
 */
export function ProjectSwitcher({ project, tab = "board" }: { project?: { id: number; name: string }; tab?: ProjectViewId }) {
  const { projects } = useProjects();
  const menu = useContextMenu();
  const trashed = useTrashedProjects(menu.isOpen).data?.length ?? 0;
  const className = project ? "project-switch" : "project-switch all-projects";
  const projectHueValue = useProjectHue(project?.id ?? 0);
  const hue = project ? hueStyle(projectHueValue) : undefined;
  const identity = (
    <>
      <ProjectMark project={project} size="md" />
      <span className="project-switch-name">{project ? project.name : ALL_PROJECTS}</span>
    </>
  );
  // 共通だけのときも、プロジェクトがないのと同じに押せなくする
  if (!projects.some(isUserProject)) {
    return (
      <span className={className} style={hue}>
        {identity}
      </span>
    );
  }
  const ordered = sidebarOrder(projects);
  const archived = archivedProjects(projects);
  return (
    <>
      <button
        className={className}
        style={hue}
        title="プロジェクトを切り替える"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        onClick={menu.toggle}
      >
        {identity}
        <ChevronDown size={14} aria-hidden />
      </button>
      {menu.menu && (
        <ProjectSwitchMenu
          at={menu.menu.at}
          projects={ordered}
          archived={archived}
          trashed={trashed}
          currentId={project?.id}
          ignore=".project-switch"
          onPick={(id) => navigate(id === undefined ? { name: "allProjects" } : { name: "project", id, tab: project ? tab : "board" })}
          onClose={menu.close}
        />
      )}
    </>
  );
}

function ProjectSwitchMenu({
  at,
  projects,
  archived,
  trashed,
  currentId,
  ignore,
  onPick,
  onClose,
}: {
  at: Placement;
  projects: Project[];
  /** 開くボタンのセレクタ（押したらボタンの側で閉じる） */
  ignore: string;
  /** しまった（アーカイブした）プロジェクト */
  archived: Project[];
  /** ゴミ箱に入れたプロジェクトの数 */
  trashed: number;
  /** いまのプロジェクト（なければ全プロジェクト） */
  currentId?: number;
  /** 選んだプロジェクト（undefined は全プロジェクト） */
  onPick: (id: number | undefined) => void;
  onClose: () => void;
}) {
  const item = (id: number | undefined, name: string) => (
    <MenuItem key={id ?? "all"} role="menuitemradio" checked={id === currentId} onSelect={() => id !== currentId && onPick(id)}>
      <ProjectMark project={id === undefined ? undefined : { id, name }} />
      <span className="project-switch-item">{name}</span>
      {id === currentId && <Check size={14} aria-hidden />}
    </MenuItem>
  );
  return (
    <PopupMenu at={at} className="project-switch-menu" label="プロジェクトを切り替える" ignore={ignore} onClose={onClose}>
      {item(undefined, ALL_PROJECTS)}
      <div className="menu-separator" role="separator" />
      {projects.map((p) => item(p.id, p.name))}
      {archived.length > 0 && (
        <>
          <div className="menu-separator" role="separator" />
          <div className="menu-label">アーカイブ済み</div>
          {archived.map((p) => item(p.id, p.name))}
        </>
      )}
      {trashed > 0 && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem onSelect={() => openSettings("trash")}>
            <Trash2 size={14} aria-hidden />
            <span className="project-switch-item">ゴミ箱のプロジェクト {trashed} 件…</span>
          </MenuItem>
        </>
      )}
    </PopupMenu>
  );
}
