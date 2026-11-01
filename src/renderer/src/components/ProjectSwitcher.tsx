import { Check, ChevronDown } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import type { ProjectSummary } from "../../../core/types";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { initialOf, projectHue } from "../projectColor";
import { sidebarOrder } from "../projectOrder";
import { navigate, type ProjectTab } from "../router";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/**
 * プロジェクトの見出しの名前。押すとほかのプロジェクトを選べ、いまのタブ（ボード・グループなど）のまま切り替わる。
 * プロジェクトが 1 つだけなら、名前だけ出す
 */
export function ProjectSwitcher({ project, projects, tab }: { project: { id: number; name: string }; projects: ProjectSummary[]; tab: ProjectTab }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  if (projects.length <= 1) return <>{project.name}</>;
  const ordered = sidebarOrder(projects);
  return (
    <>
      <button
        className="project-switch"
        title="プロジェクトを切り替える"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 16 + ordered.length * 34));
        }}
      >
        <span className="project-switch-name">{project.name}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {at && (
        <ProjectSwitchMenu
          {...at}
          projects={ordered}
          currentId={project.id}
          onPick={(id) => navigate({ name: "project", id, tab })}
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
  currentId,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  projects: ProjectSummary[];
  currentId: number;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  return (
    <PopupMenu x={x} y={y} className="project-switch-menu" label="プロジェクトを切り替える" menuRef={ref} onClose={onClose}>
      {projects.map((p) => (
        <button
          key={p.id}
          role="menuitemradio"
          aria-checked={p.id === currentId}
          onClick={() => {
            onClose();
            if (p.id !== currentId) onPick(p.id);
          }}
        >
          <span className="project-chip-mark" style={{ "--ws-hue": `${projectHue(p.id)}` } as CSSProperties} aria-hidden>
            {initialOf(p.name)}
          </span>
          <span className="project-switch-item">{p.name}</span>
          {p.id === currentId && <Check size={14} aria-hidden />}
        </button>
      ))}
    </PopupMenu>
  );
}
