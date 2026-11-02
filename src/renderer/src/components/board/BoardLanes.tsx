import { Folder, GitBranch } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PHASES, type AgentState, type ProjectSummary, type Run, type RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { initialOf, projectHue } from "../../projectColor";
import { SECTION_META } from "../../sections";
import { useRunBranch } from "../../worktreeBranches";
import { GroupToggle } from "../sidebar/GroupToggle";

/**
 * スイムレーンの段の分け方（列はどれも状態）。カンバンでは 作業場所・セクション・グループ（プロジェクトのボード）・プロジェクト（全プロジェクトのボード）、
 * グループのタブではグループで分ける
 */
export const BOARD_LANES = ["worktree", "phase", "group", "project"] as const;
export type BoardLane = (typeof BOARD_LANES)[number];

export const BOARD_LANE_LABELS: Record<BoardLane, string> = {
  worktree: "作業場所（ブランチ）",
  phase: "セクション",
  group: "グループ",
  project: "プロジェクト",
};

type Entry = { run: Run; state: AgentState };

interface Lane {
  key: string;
  head: ReactNode;
  entries: Entry[];
}

/** チャットを段に分ける（段の並び: 作業場所は本体が先、セクションは決まった順、プロジェクトはボードの並び） */
/** グループで分けるときの段の名前（"g12" のようなグループ、"none" はグループなし）から、グループの ID を取り出す */
export const groupOfLane = (laneKey: string): number | null => (laneKey === "none" ? null : Number(laneKey.slice(1)));

function lanesOf(kind: BoardLane, entries: Entry[], projects: ProjectSummary[], groups: RunGroup[], showEmpty: boolean): Lane[] {
  if (kind === "group") {
    // 自分で作ったグループを並び順のまま先に、グループなし（まだ整理していないもの）を最後に。サイドバーと同じ並び
    // （showEmpty のときは、チャットのないグループも出す）
    const ids = new Set(groups.map((g) => g.id));
    const lanes: Lane[] = [];
    for (const g of groups) {
      const list = entries.filter((e) => e.run.group_id === g.id);
      if (list.length > 0 || showEmpty) lanes.push({ key: `g${g.id}`, head: <LaneTitle mark={<Folder size={14} className="muted" />} label={g.name} />, entries: list });
    }
    const rest = entries.filter((e) => e.run.group_id === null || !ids.has(e.run.group_id));
    if (rest.length > 0 || showEmpty) lanes.push({ key: "none", head: <LaneTitle mark={<Folder size={14} className="muted" />} label="グループなし" />, entries: rest });
    return lanes;
  }
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
  groups = [],
  showEmpty = false,
  laneProps,
}: {
  kind: BoardLane;
  /** 自分で作ったグループ（グループで段に分けるとき） */
  groups?: RunGroup[];
  /** チャットのない段も出す（グループのタブ: 下書き・ドラッグで入れる先として） */
  showEmpty?: boolean;
  /** 段の要素に付けるもの（ドロップ先にするなど） */
  laneProps?: (laneKey: string) => { className?: string } & Record<string, unknown>;
  /** 段の開閉を覚える名前（ボードごと） */
  boardKey: string;
  entries: Entry[];
  projects: ProjectSummary[];
  /** 段の中の列（laneKey は段の名前。グループで分けるときは groupOfLane でグループに直せる） */
  renderColumns: (entries: Entry[], laneKey: string) => ReactNode;
  /** 段の前に置くもの（下書き） */
  before?: ReactNode;
}) {
  const closed = useStoredFlagMap("kickoff:board-lane-closed:");
  const lanes = lanesOf(kind, entries, projects, groups, showEmpty);
  return (
    <div className="board-lanes">
      {before}
      {lanes.length === 0 && <p className="column-empty">チャットはありません</p>}
      {lanes.map((lane) => {
        const id = `${boardKey}:${kind}:${lane.key}`;
        const open = !closed.get(id);
        const extra = laneProps?.(lane.key) ?? {};
        return (
          <section key={lane.key} {...extra} className={cx("board-lane", extra.className)}>
            <div className="board-lane-head">
              <GroupToggle open={open} onToggle={() => closed.toggle(id)} />
              <button className="board-lane-name" aria-expanded={open} onClick={() => closed.toggle(id)}>
                {lane.head}
                <span className="board-lane-count">{lane.entries.length}</span>
              </button>
            </div>
            {open && <div className="board-columns lane-columns">{renderColumns(lane.entries, lane.key)}</div>}
          </section>
        );
      })}
    </div>
  );
}
