import { GitBranch } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PHASES, type AgentState, type ProjectSummary, type Run } from "../../../../core/types";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { initialOf, projectHue } from "../../projectColor";
import { SECTION_META } from "../../sections";
import { useRunBranch } from "../../worktreeBranches";
import { GroupToggle } from "../sidebar/GroupToggle";

/** ボードの段（スイムレーン）の分け方: なし・作業場所（ブランチ）・セクション・プロジェクト（全プロジェクトのボードだけ） */
export const BOARD_LANES = ["none", "worktree", "phase", "project"] as const;
export type BoardLane = (typeof BOARD_LANES)[number];

export const BOARD_LANE_LABELS: Record<BoardLane, string> = {
  none: "段に分けない",
  worktree: "作業場所（ブランチ）で段に分ける",
  phase: "セクションで段に分ける",
  project: "プロジェクトで段に分ける",
};

type Entry = { run: Run; state: AgentState };

interface Lane {
  key: string;
  head: ReactNode;
  entries: Entry[];
}

/** チャットを段に分ける（段の並び: 作業場所は本体が先、セクションは決まった順、プロジェクトはボードの並び） */
function lanesOf(kind: Exclude<BoardLane, "none">, entries: Entry[], projects: ProjectSummary[]): Lane[] {
  if (kind === "phase") {
    return PHASES.flatMap((phase) => {
      const list = entries.filter((e) => e.run.phase === phase);
      if (list.length === 0) return [];
      const Icon = SECTION_META[phase].icon;
      return [{ key: phase, head: <LaneTitle mark={<Icon size={14} className={`sec-icon sec-${phase}`} />} label={SECTION_META[phase].label} />, entries: list }];
    });
  }
  if (kind === "project") {
    return projects.flatMap((p) => {
      const list = entries.filter((e) => e.run.project_id === p.id);
      if (list.length === 0) return [];
      const mark = (
        <span className="project-chip-mark" style={{ "--ws-hue": `${projectHue(p.id)}` } as CSSProperties} aria-hidden>
          {initialOf(p.name)}
        </span>
      );
      return [{ key: `p${p.id}`, head: <LaneTitle mark={mark} label={p.name} />, entries: list }];
    });
  }
  // 作業場所（プロジェクトとフォルダの組。本体が先）
  const keys = [...new Set(entries.map((e) => `${e.run.project_id}\u0000${e.run.worktree_path}`))].sort((a, b) => {
    const [pa, wa] = a.split("\u0000");
    const [pb, wb] = b.split("\u0000");
    return pa !== pb ? Number(pa) - Number(pb) : wa === "" ? -1 : wb === "" ? 1 : wa.localeCompare(wb);
  });
  return keys.map((key) => {
    const [projectId, path] = key.split("\u0000");
    const project = projects.find((p) => p.id === Number(projectId));
    return {
      key,
      head: <WorktreeLaneTitle projectId={Number(projectId)} path={path} projectName={projects.length > 1 ? project?.name : undefined} />,
      entries: entries.filter((e) => `${e.run.project_id}\u0000${e.run.worktree_path}` === key),
    };
  });
}

function LaneTitle({ mark, label, extra }: { mark: ReactNode; label: string; extra?: string }) {
  return (
    <>
      {mark}
      <span className="board-lane-label">{label}</span>
      {extra && <span className="board-lane-extra">{extra}</span>}
    </>
  );
}

function WorktreeLaneTitle({ projectId, path, projectName }: { projectId: number; path: string; projectName?: string }) {
  const branch = useRunBranch({ project_id: projectId, worktree_path: path });
  const name = branch ?? (path ? (path.split("/").pop() ?? path) : "本体");
  const place = path ? "ワークツリー" : "本体";
  return <LaneTitle mark={<GitBranch size={14} className={path ? "board-lane-worktree" : undefined} />} label={name} extra={projectName ? `${projectName} ・ ${place}` : place} />;
}

/**
 * ボードを段（スイムレーン）に分けて出す。段ごとに、状態の列（renderColumns）を横に並べる。
 * 段は見出しで開閉でき、ボードと分け方ごとに覚える
 */
export function BoardLanes({
  kind,
  boardKey,
  entries,
  projects,
  renderColumns,
  before,
}: {
  kind: Exclude<BoardLane, "none">;
  /** 段の開閉を覚える名前（ボードごと） */
  boardKey: string;
  entries: Entry[];
  projects: ProjectSummary[];
  renderColumns: (entries: Entry[]) => ReactNode;
  /** 段の前に置くもの（下書き） */
  before?: ReactNode;
}) {
  const closed = useStoredFlagMap("kickoff:board-lane-closed:");
  const lanes = lanesOf(kind, entries, projects);
  return (
    <div className="board-lanes">
      {before}
      {lanes.length === 0 && <p className="column-empty">チャットはありません</p>}
      {lanes.map((lane) => {
        const id = `${boardKey}:${kind}:${lane.key}`;
        const open = !closed.get(id);
        return (
          <section key={lane.key} className="board-lane">
            <div className="board-lane-head">
              <GroupToggle open={open} onToggle={() => closed.toggle(id)} />
              <button className="board-lane-name" aria-expanded={open} onClick={() => closed.toggle(id)}>
                {lane.head}
                <span className="board-lane-count">{lane.entries.length}</span>
              </button>
            </div>
            {open && <div className="board-columns lane-columns">{renderColumns(lane.entries)}</div>}
          </section>
        );
      })}
    </div>
  );
}
