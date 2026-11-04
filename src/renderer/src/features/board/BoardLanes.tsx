import { Folder, GitBranch } from "lucide-react";
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
import type { BoardDraft } from "./DraftCards";

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

/** 段の見出しの印と名前（グループ・プロジェクト・作業場所。作業場所は見出しをサイドバーと同じ workplaceOf で出し、種類を添える） */
function LaneTitle({ lane, showProject }: { lane: ChatBucket<BoardDraft>; showProject: boolean }) {
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
  children,
}: {
  lanes: readonly ChatBucket<BoardDraft>[];
  /** 段の開閉を覚える場所（ボードごと） */
  foldPlace: string;
  /** 段の中をリストで並べる（リスト表示。段の中の状態のまとまりを縦に並べる） */
  list?: boolean;
  /** 作業場所の段に、どのプロジェクトのものかを添える（いくつかのプロジェクトが並ぶボード） */
  showProject?: boolean;
  /** 段の要素に付けるもの（ドロップ先にするなど） */
  laneProps?: (lane: ChatBucket<BoardDraft>) => { className?: string } & Record<string, unknown>;
  /** 段の中身 */
  children: (lane: ChatBucket<BoardDraft>) => ReactNode;
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
            <FoldHead look="lane" open={open} onToggle={() => folds.set(lane.key, !open)} label={<LaneTitle lane={lane} showProject={showProject} />} count={lane.chats.length} />
            {open && <div className={list ? "lane-list" : "board-columns lane-columns"}>{children(lane)}</div>}
          </section>
        );
      })}
    </div>
  );
}
