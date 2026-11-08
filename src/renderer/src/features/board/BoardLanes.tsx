import { Folder, FolderGit2, GitBranch, Square, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useFolds } from "@/hooks/useFold";
import type { SettingValue } from "@/lib/storage";
import { ProjectMark } from "@/features/project/ProjectMark";
import { useProjects } from "@/stores/projects";
import type { PROJECT_BOARD_LANES } from "@/lib/storageKeys";
import { WORKPLACE_KIND_LABELS } from "@/features/worktree/workplace";
import type { ChatBucket } from "@/features/chatList/buckets";
import { FoldHead } from "@/ui/FoldHead";
import { Segmented } from "@/ui/Segmented";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";

/**
 * スイムレーンの段の分け方（列はどれも状態）。カンバンでは グループ・作業場所（プロジェクトのボード）・プロジェクト（全プロジェクトのボード）、
 * グループのタブではグループで分ける
 */
export type BoardLane = SettingValue<typeof PROJECT_BOARD_LANES>;

export const BOARD_LANE_LABELS: Record<BoardLane, string> = {
  group: "グループ",
  worktree: "作業場所（ブランチ）",
  project: "プロジェクト",
};

/** ボタンに出す短い名前 */
const BOARD_LANE_SHORT_LABELS: Record<BoardLane, string> = {
  group: "グループ",
  worktree: "作業場所",
  project: "プロジェクト",
};

/** 段の分け方のボタンのアイコン（グループ = フォルダ・作業場所 = ブランチ・プロジェクト = プロジェクトの印。分けない = 1 つのまとまり） */
const LANE_ICONS: Record<BoardLane | "none", LucideIcon> = {
  none: Square,
  group: Folder,
  worktree: GitBranch,
  project: FolderGit2,
};

/**
 * ボードのツールバーの段の分け方の切り替え（「分けない / グループ / 作業場所 / プロジェクト」のボタンの組。ボード・リストで共通）。
 * value は段に分けていなければ "none"。前は「段: …」の選択欄だったが、利用者の依頼で列の分け方と同じボタンの組にした
 */
export function LaneSelect({ value, options, onChange }: { value: BoardLane | "none"; options: readonly BoardLane[]; onChange: (value: BoardLane | "none") => void }) {
  return (
    <Segmented<BoardLane | "none">
      className="view-toggle"
      label="段（スイムレーン）の分け方"
      value={value}
      onChange={onChange}
      options={(["none", ...options] as const).map((l) => ({
        value: l,
        label: l === "none" ? "分けない" : BOARD_LANE_SHORT_LABELS[l],
        icon: LANE_ICONS[l],
        tip: l === "none" ? "段（スイムレーン）に分けない" : `${BOARD_LANE_LABELS[l]}ごとの段（スイムレーン）に分ける`,
      }))}
    />
  );
}

/** 段の見出しの印と名前（グループ・プロジェクト・作業場所。作業場所は見出しをサイドバーと同じ workplaceOf で出し、種類を添える） */
function LaneTitle({ lane, showProject }: { lane: ChatBucket<PanelDraft>; showProject: boolean }) {
  const { projectName } = useProjects();
  const { place } = lane;
  if (place) {
    const kindLabel = WORKPLACE_KIND_LABELS[place.kind];
    // 複数のプロジェクトが並ぶボードでは、どのプロジェクトの作業場所かを添える
    const extra = showProject && lane.projectId !== undefined ? `${projectName(lane.projectId)} ・ ${kindLabel}` : kindLabel;
    return (
      <>
        <GitBranch size={14} className={cx(place.kind === "worktree" && "board-lane-worktree", (place.kind === "missing" || place.kind === "past") && "board-lane-gone")} />
        <span className="board-lane-label" title={lane.title}>
          {lane.label}
        </span>
        <span className="board-lane-extra">{extra}</span>
      </>
    );
  }
  return (
    <>
      {lane.kind === "project" ? <ProjectMark project={lane.project} /> : <Folder size={14} className="muted" />}
      <span className="board-lane-label">{lane.label}</span>
    </>
  );
}

/**
 * ボードを段（スイムレーン）に分けて出す。段は bucketChats のまとまり（グループ・作業場所・プロジェクト。中の段が状態の列）で、
 * 段の中身（children: 下書きと状態の列・リストのまとまり）は呼ぶ側が描く。
 * 段は見出しで開閉でき、ボード（foldPlace）と段のまとまりのキーで覚える
 */
export function BoardLanes({
  lanes,
  foldPlace,
  list = false,
  showProject = false,
  laneProps,
  headProps,
  actions,
  children,
}: {
  lanes: readonly ChatBucket<PanelDraft>[];
  /** 段の開閉を覚える場所（ボードごと） */
  foldPlace: string;
  /** 段の中をリストで並べる（リスト表示。段の中の状態のまとまりを縦に並べる） */
  list?: boolean;
  /** 作業場所の段に、どのプロジェクトのものかを添える（いくつかのプロジェクトが並ぶボード） */
  showProject?: boolean;
  /** 段の要素に付けるもの（ドロップ先にするなど） */
  laneProps?: (lane: ChatBucket<PanelDraft>) => { className?: string } & Record<string, unknown>;
  /** 段の見出しに付けるもの（ドラッグで段を並べ替えるつかむところなど） */
  headProps?: (lane: ChatBucket<PanelDraft>) => Record<string, unknown>;
  /** 段の見出しの名前の右に置く操作（全プロジェクトのリストの「グループを作成」） */
  actions?: (lane: ChatBucket<PanelDraft>) => ReactNode;
  /** 段の中身 */
  children: (lane: ChatBucket<PanelDraft>) => ReactNode;
}) {
  const folds = useFolds(
    foldPlace,
    lanes.map((l) => l.key),
  );
  return (
    <div className="board-lanes">
      {lanes.length === 0 && <p className="column-empty">チャットはありません</p>}
      {lanes.map((lane) => {
        const open = folds.isOpen(lane.key);
        const extra = laneProps?.(lane) ?? {};
        return (
          <section key={lane.key} {...extra} className={cx("board-lane", extra.className)}>
            <FoldHead {...headProps?.(lane)} look="lane" open={open} onToggle={() => folds.set(lane.key, !open)} label={<LaneTitle lane={lane} showProject={showProject} />} count={lane.chats.length} actions={actions?.(lane)} className={actions && "board-lane-head-actions"} />
            {open && <div className={list ? "lane-list" : "board-columns lane-columns"}>{children(lane)}</div>}
          </section>
        );
      })}
    </div>
  );
}
