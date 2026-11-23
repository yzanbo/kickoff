import { Folder, FolderGit2, GitBranch, Square, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useFolds } from "@/foundation/ui/hooks/useFold";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { hueStyle, projectHue } from "@/features/projects/ui/projectColor";
import { useProjects } from "@/features/projects/ui/stores/projects";
import type { BoardLane } from "./layout";
import { WORKPLACE_KIND_LABELS } from "@/foundation/ui/workplace/workplace";
import { newChatPlaceOf, type ChatBucket, type DraftTarget } from "@/features/chatList/ui/buckets";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { NewChatItem } from "@/features/chat/ui/open/NewChatItem";
import { PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import type { ChatGrouping } from "@/features/chatList/ui/chatGrouping";
import { useBucketHueOf } from "@/features/chatList/ui/useChatBuckets";
import { FoldHead, type FoldLook } from "@/foundation/ui/kit/FoldHead";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import type { PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { RowBudgetScope, useRowBudgets } from "@/foundation/ui/hooks/useProgressiveRows";

const BOARD_LANE_LABELS: Record<BoardLane, string> = {
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

/** 段の見出しの見た目（FoldHead の look。件数は名前のボタンの中） */
const FOLD_LANE: FoldLook = { wrap: "board-lane", head: "board-lane-head", name: "board-lane-name", count: "board-lane-count", countInName: true };

/**
 * ボードのツールバーの段の分け方の切り替え（「分けない / グループ / 作業場所 / プロジェクト」のボタンの組。ボード・リストで共通）。
 * value は段に分けていなければ "none"。列の分け方と同じボタンの組
 */
export function LaneSelect({ value, options, onChange }: { value: BoardLane | "none"; options: readonly BoardLane[]; onChange: (value: BoardLane | "none") => void }) {
  return (
    <Segmented<BoardLane | "none">
      look="toggle"
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
function LaneTitle({ lane, showProject }: { lane: ChatBucket<PlacedDraft>; showProject: boolean }) {
  const { projectName } = useProjects();
  const { place } = lane;
  if (place) {
    const kindLabel = WORKPLACE_KIND_LABELS[place.kind];
    // 複数のプロジェクトが並ぶボードでは、どのプロジェクトの作業場所かを添える
    const extra = showProject && lane.projectId !== undefined ? `${projectName(lane.projectId)} ・ ${kindLabel}` : kindLabel;
    return (
      <>
        <GitBranch size={14} className={cx(place.kind === "worktree" && "board-lane-worktree", place.kind === "missing" && "board-lane-gone")} />
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

/** 段のまとめ方（色を決めるため。グループ・グループなしの段があればグループ別、作業場所の段があれば作業場所別、プロジェクトの段だけなら色はプロジェクトから） */
function laneGrouping(lanes: readonly ChatBucket<PlacedDraft>[]): ChatGrouping {
  if (lanes.some((l) => l.kind === "group" || l.kind === "ungrouped")) return "group";
  return lanes.some((l) => l.place) ? "worktree" : "none";
}

/**
 * 段の見出しの地の色（サイドバーのプロジェクトのカードと同じく、薄い色の地を横幅いっぱいに敷く）。プロジェクトの段はプロジェクトの色（--hue。
 * 地は ProjectMark.css の札と共通）、グループ・作業場所の段はサイドバー・タブの列のまとまりと同じ色（--hue。bucketHues.ts）。色のない段は灰色の地
 */
function useLaneTint(lanes: readonly ChatBucket<PlacedDraft>[]): (lane: ChatBucket<PlacedDraft>) => { className: string; style?: CSSProperties } {
  const projectIds = [...new Set(lanes.flatMap((l) => (l.projectId === undefined ? [] : [l.projectId])))];
  const hueOf = useBucketHueOf(laneGrouping(lanes), projectIds, true);
  // プロジェクトの色（色を変えたら描き直す）
  const { projectsById } = useProjects();
  return (lane) => {
    if (lane.kind === "project" && lane.projectId !== undefined) return { className: "lane-project", style: hueStyle(projectsById.get(lane.projectId)?.hue ?? projectHue(lane.projectId)) };
    const hue = hueOf(lane);
    return hue === null ? { className: "lane-plain" } : { className: "lane-hued", style: { "--hue": hue } as CSSProperties };
  };
}

/** 段が縦に取る行の数（リストは段のすべて、ボードの状態の列は横に並ぶのでいちばん長い列） */
function laneRows(lane: ChatBucket<PlacedDraft>, list: boolean): number {
  if (list || !lane.children?.length) return lane.chats.length;
  return Math.max(...lane.children.map((c) => c.chats.length));
}

/**
 * ボードを段（スイムレーン）に分けて出す。段は bucketChats のまとまり（グループ・作業場所・プロジェクト。中の段が状態の列）で、
 * 段の中身（children: 下書きと状態の列・リストのまとまり）は呼ぶ側が描く。
 * 段は見出しで開閉でき（名前だけでなく、見出しの空いているところを押しても）、ボード（foldPlace）と段のまとまりのキーで覚える。
 * グループ・No Group・作業場所の段の見出しの右クリックは、その段で始める「新しいチャット」（どこで始めるかの札を添える。チャットの右クリックと同じ NewChatItem。
 * プロジェクトの段・フォルダのない作業場所の段では出さない）
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
  lanes: readonly ChatBucket<PlacedDraft>[];
  /** 段の開閉を覚える場所（ボードごと） */
  foldPlace: string;
  /** 段の中をリストで並べる（リスト表示。段の中の状態のまとまりを縦に並べる） */
  list?: boolean;
  /** 作業場所の段に、どのプロジェクトのものかを添える（いくつかのプロジェクトが並ぶボード） */
  showProject?: boolean;
  /** 段の要素に付けるもの（ドロップ先にするなど） */
  laneProps?: (lane: ChatBucket<PlacedDraft>) => { className?: string } & Record<string, unknown>;
  /** 段の見出しに付けるもの（ドラッグで段を並べ替えるつかむところなど） */
  headProps?: (lane: ChatBucket<PlacedDraft>) => Record<string, unknown>;
  /** 段の見出しの名前の右に置く操作（全プロジェクトのリストの「グループを作成」） */
  actions?: (lane: ChatBucket<PlacedDraft>) => ReactNode;
  /** 段の中身 */
  children: (lane: ChatBucket<PlacedDraft>) => ReactNode;
}) {
  const tint = useLaneTint(lanes);
  // 段の見出しの右クリックのメニュー（その段で始める新しいチャット）
  const laneMenu = useContextMenu<{ place: DraftTarget; branch: string | null }>();
  const folds = useFolds(
    foldPlace,
    lanes.map((l) => l.key),
  );
  // 最初に描く行の上限（hooks/useProgressiveRows.ts）を、上の段から順に配る。段の中で列が横に並ぶボードは、いちばん長い列の分だけ縦に場所を取る
  const budgets = useRowBudgets(lanes.map((lane) => (folds.isOpen(lane.key) ? laneRows(lane, list) : 0)));
  return (
    <div className="board-lanes">
      {lanes.length === 0 && <p className="empty-note column-empty">チャットはありません</p>}
      {lanes.map((lane, i) => {
        const open = folds.isOpen(lane.key);
        const extra = laneProps?.(lane) ?? {};
        const head = tint(lane);
        const place = newChatPlaceOf(lane);
        return (
          <section key={lane.key} {...extra} className={cx("board-lane", extra.className)}>
            <FoldHead
              {...headProps?.(lane)}
              look={FOLD_LANE}
              open={open}
              onToggle={() => folds.set(lane.key, !open)}
              onClick={(e) => {
                // 見出しの空いているところ（名前の右・「グループを作成」の右など）を押しても開閉する。中のボタン・入力欄（作成の欄）はそちらの動き
                if ((e.target as HTMLElement).closest("button, a, input, select, textarea, .lane-group-create")) return;
                folds.set(lane.key, !open);
              }}
              label={<LaneTitle lane={lane} showProject={showProject} />}
              // 送る前の新しいチャット（下書き。New Chat）も 1 つと数える（サイドバーのグループの見出しと同じ）
              count={lane.chats.length + lane.drafts.length}
              actions={actions?.(lane)}
              className={cx(head.className, actions && "board-lane-head-actions")}
              style={head.style}
              onContextMenu={
                place
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      laneMenu.open(e, { place, branch: lane.place?.name ?? null });
                    }
                  : undefined
              }
            />
            {open && (
              <div className={list ? "lane-list" : "board-columns lane-columns"}>
                <RowBudgetScope value={budgets[i]}>{children(lane)}</RowBudgetScope>
              </div>
            )}
          </section>
        );
      })}
      {laneMenu.menu && (
        <PopupMenu at={laneMenu.menu.at} label="段の操作" onClose={laneMenu.close}>
          <NewChatItem
            place={laneMenu.menu.value.place}
            branch={laneMenu.menu.value.branch}
            sameAs=""
            onSelect={() => {
              const target = laneMenu.menu?.value.place;
              if (target) openTarget({ kind: "newChat", projectId: target.projectId, groupId: target.group, worktree: target.worktree });
            }}
          />
        </PopupMenu>
      )}
    </div>
  );
}
