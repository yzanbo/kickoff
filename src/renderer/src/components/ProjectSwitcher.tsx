import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ProjectSummary } from "../../../core/types";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { initialOf, projectHue } from "../projectColor";
import { archivedProjects, sidebarOrder } from "../projectOrder";
import { navigate, type ProjectTab } from "../router";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/** 全プロジェクトの画面の名前（サイドバーの項目と同じ） */
const ALL_PROJECTS = "全プロジェクト";

/**
 * 画面の見出しの名前（プロジェクトの画面と全プロジェクトの画面）。サイドバーと同じプロジェクトの色のカード（名前だけ。頭文字の四角は付けない）にして、どのプロジェクトかを色でもわかるようにする。
 * project がなければ全プロジェクト。押すと全プロジェクト・ほかのプロジェクトを選べ、プロジェクトどうしはいまのタブ（ボード・グループなど）のまま切り替わる
 * （全プロジェクトから選んだときはカンバン）。しまった（アーカイブした）プロジェクトは下の「アーカイブ済み」に分けて出す。プロジェクトがなければ押せない
 */
export function ProjectSwitcher({ project, projects, tab = "board" }: { project?: { id: number; name: string }; projects: ProjectSummary[]; tab?: ProjectTab }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const hue = project ? ({ "--ws-hue": `${projectHue(project.id)}` } as CSSProperties) : undefined;
  const className = project ? "project-switch" : "project-switch all-projects";
  const identity = (
    <>
      {!project && <LayoutGrid size={16} aria-hidden />}
      <span className="project-switch-name">{project ? project.name : ALL_PROJECTS}</span>
    </>
  );
  if (projects.length === 0) {
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
        aria-expanded={at !== null}
        onClick={(e) => {
          // 開いているときに押したら閉じる
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 25 + (ordered.length + 1) * 34 + (archived.length > 0 ? 40 + archived.length * 34 : 0)));
        }}
      >
        {identity}
        <ChevronDown size={16} aria-hidden />
      </button>
      {at && (
        <ProjectSwitchMenu
          {...at}
          projects={ordered}
          archived={archived}
          currentId={project?.id}
          onPick={(id) => navigate(id === undefined ? { name: "allProjects" } : { name: "project", id, tab: project ? tab : "board" })}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

function ProjectSwitchMenu({
  x,
  y,
  projects,
  archived,
  currentId,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  projects: ProjectSummary[];
  /** しまった（アーカイブした）プロジェクト */
  archived: ProjectSummary[];
  /** いまのプロジェクト（なければ全プロジェクト） */
  currentId?: number;
  /** 選んだプロジェクト（undefined は全プロジェクト） */
  onPick: (id: number | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  const item = (id: number | undefined, mark: ReactNode, name: string) => (
    <button
      key={id ?? "all"}
      role="menuitemradio"
      aria-checked={id === currentId}
      onClick={() => {
        onClose();
        if (id !== currentId) onPick(id);
      }}
    >
      <span
        className={id === undefined ? "project-chip-mark all-projects" : "project-chip-mark"}
        style={id === undefined ? undefined : ({ "--ws-hue": `${projectHue(id)}` } as CSSProperties)}
        aria-hidden
      >
        {mark}
      </span>
      <span className="project-switch-item">{name}</span>
      {id === currentId && <Check size={14} aria-hidden />}
    </button>
  );
  return (
    <PopupMenu x={x} y={y} className="project-switch-menu" label="プロジェクトを切り替える" ignore=".project-switch" menuRef={ref} onClose={onClose}>
      {item(undefined, <LayoutGrid size={10} />, ALL_PROJECTS)}
      <div className="menu-separator" role="separator" />
      {projects.map((p) => item(p.id, initialOf(p.name), p.name))}
      {archived.length > 0 && (
        <>
          <div className="menu-separator" role="separator" />
          <div className="menu-label">アーカイブ済み</div>
          {archived.map((p) => item(p.id, initialOf(p.name), p.name))}
        </>
      )}
    </PopupMenu>
  );
}
