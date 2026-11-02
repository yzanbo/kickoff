import { Plus } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type DragEvent } from "react";
import type { Approval, ProjectSummary } from "../../../../core/types";
import { cx } from "../../cx";
import type { useReorder } from "../../groups";
import { initialOf, projectHue } from "../../projectColor";

/**
 * 横スライドの下の行の、プロジェクトの丸の列（押すとそのプロジェクトへ・ドラッグで並べ替え・右クリックでメニュー）。
 * 選んでいるプロジェクトの丸は、スクロールして見えるところに出す
 */
export function WorkspaceDots({
  projects,
  index,
  approvals,
  isArchived,
  reorder,
  reorderDrop,
  onGo,
  onMenu,
  onNewProject,
}: {
  projects: ProjectSummary[];
  /** 選んでいるプロジェクトの位置 */
  index: number;
  approvals: Approval[];
  /** しまった（アーカイブした）プロジェクトか（並べ替えない） */
  isArchived: (id: number) => boolean;
  reorder: ReturnType<typeof useReorder>;
  reorderDrop: (id: number) => Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>>;
  onGo: (index: number) => void;
  onMenu: (at: { x: number; y: number }, project: ProjectSummary) => void;
  onNewProject: () => void;
}) {
  const dotsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dotsRef.current?.querySelector(".workspace-dot.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);
  // 右の並べ方の切り替えを除いた幅で、真ん中に並べる。入りきらなければ横にスクロール（マウスのホイールでも横に動く）
  return (
    <div
      ref={dotsRef}
      className="workspace-dots"
      role="tablist"
      aria-label="プロジェクトの切り替え"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {projects.map((p, i) => {
        const waiting = approvals.some((a) => a.project_id === p.id);
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={i === index}
            className={cx("workspace-dot", i === index && "active", p.pinned > 0 && "pinned", isArchived(p.id) ? "archived" : reorder.classFor(p.id))}
            style={{ "--ws-hue": `${projectHue(p.id)}` } as CSSProperties}
            title={`${p.name}${p.pinned ? "（固定）" : ""}${isArchived(p.id) ? "（アーカイブ済み）" : ""}${i < 9 ? `（⌃${i + 1}）` : ""}（${isArchived(p.id) ? "" : "ドラッグで並べ替え・"}右クリックで固定・アーカイブ）`}
            onClick={() => onGo(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              onMenu({ x: e.clientX, y: e.clientY }, p);
            }}
            draggable={!isArchived(p.id)}
            {...(isArchived(p.id) ? {} : reorder.handle(p.id))}
            {...reorderDrop(p.id)}
          >
            {initialOf(p.name)}
            {waiting && <span className="workspace-dot-badge" aria-label="回答待ちあり" />}
          </button>
        );
      })}
      <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
        <Plus size={14} />
      </button>
    </div>
  );
}
