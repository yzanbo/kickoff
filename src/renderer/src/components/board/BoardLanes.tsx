import { Folder, GitBranch } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PHASES, type AgentState, type GitWorktree, type ProjectSummary, type Run, type RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { useStoredFlagMap } from "../../hooks/useStoredState";
import { initialOf, projectHue } from "../../projectColor";
import { useProjects } from "../../projectsContext";
import { SECTION_META } from "../../sections";
import { BOARD_LANE_CLOSED_PREFIX } from "../../storageKeys";
import { useWorktreeLists } from "../../worktree/worktreeBranches";
import { compareWorkplaces, workplaceOf, WORKPLACE_KIND_LABELS, type RunWorkplace } from "../../worktree/workplace";
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

function lanesOf(
  kind: BoardLane,
  entries: Entry[],
  projects: ProjectSummary[],
  groups: RunGroup[],
  showEmpty: boolean,
  worktreesOf: (projectId: number) => GitWorktree[] | undefined,
  projectName: (projectId: number) => string,
): Lane[] {
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
  // 作業場所（プロジェクトと作業場所の組。本体が先。見出しはサイドバーと同じ workplaceOf）
  const byPlace = new Map<string, { projectId: number; place: RunWorkplace; entries: Entry[] }>();
  for (const e of entries) {
    const place = workplaceOf(e.run, worktreesOf(e.run.project_id));
    const key = `${e.run.project_id}\u0000${place.key}`;
    const hit = byPlace.get(key);
    if (hit) hit.entries.push(e);
    else byPlace.set(key, { projectId: e.run.project_id, place, entries: [e] });
  }
  return [...byPlace.entries()]
    .sort(([, a], [, b]) => a.projectId - b.projectId || compareWorkplaces(a.place, b.place))
    .map(([key, { projectId, place, entries: list }]) => {
      // 複数のプロジェクトが並ぶボードでは、どのプロジェクトの作業場所かを添える
      const name = projects.length > 1 ? projectName(projectId) : undefined;
      const kindLabel = WORKPLACE_KIND_LABELS[place.kind];
      return {
        key,
        head: (
          <LaneTitle
            mark={<GitBranch size={14} className={cx(place.kind === "worktree" && "board-lane-worktree", (place.kind === "missing" || place.kind === "past") && "board-lane-gone")} />}
            label={place.name || "本体"}
            extra={name ? `${name} ・ ${kindLabel}` : kindLabel}
            title={place.title}
          />
        ),
        entries: list,
      };
    });
}

function LaneTitle({ mark, label, extra, title }: { mark: ReactNode; label: string; extra?: string; title?: string }) {
  return (
    <>
      {mark}
      <span className="board-lane-label" title={title}>
        {label}
      </span>
      {extra && <span className="board-lane-extra">{extra}</span>}
    </>
  );
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
  const closed = useStoredFlagMap(BOARD_LANE_CLOSED_PREFIX);
  // 作業場所で分けるときは、プロジェクトごとのワークツリーの一覧からブランチ名を引く
  const worktreesOf = useWorktreeLists(kind === "worktree" ? entries.map((e) => e.run.project_id) : []);
  const { projectName } = useProjects();
  const lanes = lanesOf(kind, entries, projects, groups, showEmpty, worktreesOf, projectName);
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
