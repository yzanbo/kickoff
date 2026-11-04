import { Folder, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { GitWorktree, Project, ChatGroup } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSettingFamily } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { ProjectMark } from "@/features/project/ProjectMark";
import { useProjects } from "@/app/projectsContext";
import { boardLaneClosed, type PROJECT_BOARD_LANES } from "@/lib/storageKeys";
import { useWorktreesOf } from "@/stores/worktrees";
import { compareWorkplaces, workplaceOf, WORKPLACE_KIND_LABELS, type ChatWorkplace } from "@/features/worktree/workplace";
import { GroupToggle } from "@/ui/GroupToggle";
import type { BoardEntry } from "@/features/chatList/boardColumns";

/**
 * スイムレーンの段の分け方（列はどれも状態）。カンバンでは 作業場所・グループ（プロジェクトのボード）・プロジェクト（全プロジェクトのボード）、
 * グループのタブではグループで分ける
 */
export type BoardLane = SettingValue<typeof PROJECT_BOARD_LANES>;

export const BOARD_LANE_LABELS: Record<BoardLane, string> = {
  worktree: "作業場所（ブランチ）",
  group: "グループ",
  project: "プロジェクト",
};

/** 下書き（送る前の新しいチャット）の作成先 */
export interface DraftTarget {
  projectId: number;
  group?: number;
}

/**
 * ボードの見出しの段の分け方の選択（「段: 分けない / 作業場所 / グループ / プロジェクト」。ボード・リストで共通）。
 * value は段に分けていなければ "none"
 */
export function LaneSelect({ value, options, onChange }: { value: BoardLane | "none"; options: readonly BoardLane[]; onChange: (value: BoardLane | "none") => void }) {
  return (
    <select className="board-filter" aria-label="段の分け方" title="段（スイムレーン）の分け方" value={value} onChange={(e) => onChange(e.target.value as BoardLane | "none")}>
      <option value="none">段: 分けない</option>
      {options.map((l) => (
        <option key={l} value={l}>
          段: {BOARD_LANE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}

interface Lane {
  key: string;
  head: ReactNode;
  entries: BoardEntry[];
  /** この段に入れる下書きか（下書きは段のいちばん左の列に出す） */
  draft: (target: DraftTarget) => boolean;
}

/** どの段にも入れない（下書きの入る段がない） */
const noDraft = () => false;

/** チャットを段に分ける（段の並び: 作業場所は本体が先、プロジェクトはボードの並び） */
/** グループで分けるときの段の名前（"g12" のようなグループ、"none" はグループなし）から、グループの ID を取り出す */
export const groupOfLane = (laneKey: string): number | null => (laneKey === "none" ? null : Number(laneKey.slice(1)));

/**
 * チャットと下書きを段に分ける（段の並び: 作業場所は本体が先、プロジェクトはボードの並び）。
 * 下書きは作成先の段に入れる（グループ = そのグループ・プロジェクト = そのプロジェクト・作業場所 = そのプロジェクトの本体。
 * 新しいチャットは本体で始まり、作業場所は送るときに選ぶため）。下書きだけの段も出す
 */
function lanesOf(
  kind: BoardLane,
  entries: BoardEntry[],
  drafts: DraftTarget[],
  projects: Project[],
  groups: ChatGroup[],
  showEmpty: boolean,
  worktreesOf: (projectId: number) => GitWorktree[] | undefined,
  projectName: (projectId: number) => string,
): Lane[] {
  if (kind === "group") {
    // 自分で作ったグループを並び順のまま先に、グループなし（まだ整理していないもの）を最後に。サイドバーと同じ並び
    // （showEmpty のときは、チャットのないグループも出す）
    const ids = new Set(groups.map((g) => g.id));
    const inNone = (group: number | null | undefined) => group == null || !ids.has(group);
    const lanes: Lane[] = [];
    for (const g of groups) {
      const list = entries.filter((e) => e.chat.group_id === g.id);
      const draft = (t: DraftTarget) => t.group === g.id;
      if (list.length > 0 || showEmpty || drafts.some(draft)) lanes.push({ key: `g${g.id}`, head: <LaneTitle mark={<Folder size={14} className="muted" />} label={g.name} />, entries: list, draft });
    }
    const rest = entries.filter((e) => inNone(e.chat.group_id));
    const draft = (t: DraftTarget) => inNone(t.group);
    if (rest.length > 0 || showEmpty || drafts.some(draft)) lanes.push({ key: "none", head: <LaneTitle mark={<Folder size={14} className="muted" />} label="グループなし" />, entries: rest, draft });
    return lanes;
  }
  if (kind === "project") {
    return projects.flatMap((p) => {
      const list = entries.filter((e) => e.chat.project_id === p.id);
      const draft = (t: DraftTarget) => t.projectId === p.id;
      if (list.length === 0 && !drafts.some(draft)) return [];
      return [{ key: `p${p.id}`, head: <LaneTitle mark={<ProjectMark project={p} />} label={p.name} />, entries: list, draft }];
    });
  }
  // 作業場所（プロジェクトと作業場所の組。本体が先。見出しはサイドバーと同じ workplaceOf）
  const byPlace = new Map<string, { projectId: number; place: ChatWorkplace; entries: BoardEntry[] }>();
  for (const e of entries) {
    const place = workplaceOf(e.chat, worktreesOf(e.chat.project_id));
    const key = `${e.chat.project_id}\u0000${place.key}`;
    const hit = byPlace.get(key);
    if (hit) hit.entries.push(e);
    else byPlace.set(key, { projectId: e.chat.project_id, place, entries: [e] });
  }
  // 下書きのあるプロジェクトの本体の段（チャットがなくても出す）
  for (const projectId of new Set(drafts.map((d) => d.projectId))) {
    const place = workplaceOf({ worktree_path: null, branch: null }, worktreesOf(projectId));
    const key = `${projectId}\u0000${place.key}`;
    if (!byPlace.has(key)) byPlace.set(key, { projectId, place, entries: [] });
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
        draft: place.kind === "main" ? (t: DraftTarget) => t.projectId === projectId : noDraft,
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
 * 下書きはボードの表示と同じく、段の中のいちばん左の列に出す（renderColumns に段の下書きの見分け方を渡す）。
 * 段は見出しで開閉でき、ボードと分け方ごとに覚える
 */
export function BoardLanes({
  kind,
  boardKey,
  entries,
  projects,
  renderColumns,
  drafts = [],
  groups = [],
  showEmpty = false,
  list = false,
  laneProps,
}: {
  /** 段の中をリストで並べる（リスト表示。段の中の状態のまとまりを縦に並べる） */
  list?: boolean;
  kind: BoardLane;
  /** 自分で作ったグループ（グループで段に分けるとき） */
  groups?: ChatGroup[];
  /** チャットのない段も出す（グループのタブ: 下書き・ドラッグで入れる先として） */
  showEmpty?: boolean;
  /** 段の要素に付けるもの（ドロップ先にするなど） */
  laneProps?: (laneKey: string) => { className?: string } & Record<string, unknown>;
  /** 段の開閉を覚える名前（ボードごと） */
  boardKey: string;
  entries: BoardEntry[];
  projects: Project[];
  /** 段の中の列（laneKey は段の名前。グループで分けるときは groupOfLane でグループに直せる。draft はこの段に入れる下書きか） */
  renderColumns: (entries: BoardEntry[], laneKey: string, draft: (target: DraftTarget) => boolean) => ReactNode;
  /** 下書きの作成先（下書きだけの段も出すため） */
  drafts?: DraftTarget[];
}) {
  const closed = useSettingFamily(boardLaneClosed);
  // 作業場所で分けるときは、プロジェクトごとのワークツリーの一覧からブランチ名を引く
  const worktreesOf = useWorktreesOf(kind === "worktree" ? entries.map((e) => e.chat.project_id) : []);
  const { projectName } = useProjects();
  const lanes = lanesOf(kind, entries, drafts, projects, groups, showEmpty, worktreesOf, projectName);
  return (
    <div className="board-lanes">
      {lanes.length === 0 && <p className="column-empty">チャットはありません</p>}
      {lanes.map((lane) => {
        const id = `${boardKey}:${kind}:${lane.key}`;
        const open = !closed.get(id);
        const extra = laneProps?.(lane.key) ?? {};
        return (
          <section key={lane.key} {...extra} className={cx("board-lane", extra.className)}>
            <div className="board-lane-head">
              <GroupToggle open={open} onToggle={() => closed.set(id, open)} />
              <button className="board-lane-name" aria-expanded={open} onClick={() => closed.set(id, open)}>
                {lane.head}
                <span className="board-lane-count">{lane.entries.length}</span>
              </button>
            </div>
            {open && <div className={list ? "lane-list" : "board-columns lane-columns"}>{renderColumns(lane.entries, lane.key, lane.draft)}</div>}
          </section>
        );
      })}
    </div>
  );
}
