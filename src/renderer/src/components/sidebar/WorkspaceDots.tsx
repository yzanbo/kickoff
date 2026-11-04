import { Plus } from "lucide-react";
import { Fragment, useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import type { ProjectSummary } from "../../../../core/types";
import { cx } from "../../cx";
import { initialOf, projectHue } from "../../projectColor";
import type { StateCounts } from "../../runState";
import { StateCornerCounts, stateCountsSummary } from "../StateCornerCounts";
import type { ProjectReorder } from "./useProjectReorder";

/**
 * 横スライドの下の行の、プロジェクトの丸の列（押すとそのプロジェクトへ・ドラッグで並べ替え・右クリックでメニュー）。
 * 丸の角に状態ごとの件数を出す（左上 = 作業中（青）・右上 = 未読（緑）・左下 = 回答待ち（オレンジ））。選んでいるプロジェクトの丸は、スクロールして見えるところに出す
 */
export function WorkspaceDots({
  projects,
  index,
  countsOf,
  isArchived,
  reorder,
  onGo,
  onMenu,
  onNewProject,
}: {
  projects: ProjectSummary[];
  /** 選んでいるプロジェクトの位置 */
  index: number;
  /** プロジェクトごとの、作業中・回答待ち・未読のチャット数 */
  countsOf: (id: number) => StateCounts;
  /** しまった（アーカイブした）プロジェクトか（薄く出す） */
  isArchived: (id: number) => boolean;
  /** ドラッグでの並べ替え（最近動いた順・しまったものは並べ替えない） */
  reorder: ProjectReorder;
  onGo: (index: number) => void;
  /** 右クリック（プロジェクトのメニューを開く） */
  onMenu: (e: MouseEvent, project: ProjectSummary) => void;
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
        const counts = countsOf(p.id);
        const draggable = reorder.draggable(p.id);
        const summary = stateCountsSummary(counts);
        // 固定したプロジェクトの丸と、残りの丸の間に区切りを入れる
        const divider = i > 0 && projects[i - 1].pinned && !p.pinned;
        return (
          <Fragment key={p.id}>
          {divider && <span className="workspace-dots-divider" role="separator" aria-hidden />}
          <button
            role="tab"
            aria-selected={i === index}
            className={cx("workspace-dot", i === index && "active", p.pinned && "pinned", isArchived(p.id) && "archived", reorder.classFor(p.id))}
            style={{ "--ws-hue": `${projectHue(p.id)}` } as CSSProperties}
            title={`${p.name}${summary ? `（${summary}）` : ""}${p.pinned ? "（固定）" : ""}${isArchived(p.id) ? "（アーカイブ済み）" : ""}${i < 9 ? `（⌃${i + 1}）` : ""}（${draggable ? "ドラッグで並べ替え・" : ""}右クリックで固定・アーカイブ）`}
            onClick={() => onGo(i)}
            onContextMenu={(e) => onMenu(e, p)}
            draggable={draggable}
            {...reorder.handle(p.id)}
            {...reorder.dropProps(p.id)}
          >
            {initialOf(p.name)}
            {/* 状態ごとの件数（色はカンバンの列と同じ）: 左上 = 作業中、右上 = 未読、左下 = 回答待ち */}
            <StateCornerCounts counts={counts} />
          </button>
          </Fragment>
        );
      })}
      <button className="workspace-dot add" title="新しいプロジェクト" aria-label="新しいプロジェクト" onClick={onNewProject}>
        <Plus size={14} />
      </button>
    </div>
  );
}
