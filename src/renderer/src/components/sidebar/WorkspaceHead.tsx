import { ArchiveRestore, FolderPlus, Pin, Plus } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { ProjectSummary, RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { initialOf } from "../../projectColor";
import { changeProject } from "../../projectOrder";
import { href, openNewChat } from "../../router";
import { Chevron } from "../Chevron";
import { GroupPickMenu } from "../GroupPickMenu";
import { IconButton } from "../IconButton";
import { ChatGroupingMenu, type ChatGrouping } from "./ChatGroupingMenu";
import { HeadCounts } from "./HeadCounts";
import { useProjectMenu } from "./ProjectMenu";
import type { StateCounts } from "./sidebarFlags";

/**
 * サイドバーのプロジェクトの見出し（どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする）。
 * 常に出すのは、いつも使うものだけ: チャット一覧の開閉・名前（押すとカンバン）・状態ごとのチャット数・新しいチャット（＋）と、固定の印。
 * マウスを乗せたとき（ピントがあるとき）だけ出す: 固定する・チャットの並べ方・グループを作成。
 * しまった（アーカイブした）プロジェクトは、ピンの代わりに戻すボタンを常に出す。
 * 右クリックで、プロジェクトに対するすべての操作をまとまりに分けたメニュー（useProjectMenu）
 */
export function WorkspaceHead({
  project,
  groups,
  active,
  collapsed,
  onToggleCollapsed,
  chatCount,
  counts,
  grouping,
  onGroupingChange,
  showArchived,
  onShowArchived,
  onCreateGroup,
  headDrag,
}: {
  project: ProjectSummary;
  groups: RunGroup[];
  active: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  chatCount: number;
  /** 作業中・回答待ち・確認待ちのチャット数 */
  counts: StateCounts;
  grouping: ChatGrouping;
  onGroupingChange: (grouping: ChatGrouping) => void;
  /** アーカイブ済みのチャットを一覧の下に出すか */
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
  onCreateGroup: () => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}) {
  // ＋を押したときの、作成先のグループを選ぶメニュー
  const [pickAt, setPickAt] = useState<{ x: number; y: number } | null>(null);
  const projectMenu = useProjectMenu([project]);
  return (
    <>
      <div
        className={cx("workspace-head", active && "active", project.archived_at && "archived")}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える（右クリックで固定・アーカイブ）" : "右クリックで固定・アーカイブ"}
        onContextMenu={(e) => projectMenu.open(e, project, { onCreateGroup, collapse: { collapsed, toggle: onToggleCollapsed } })}
        {...headDrag}
      >
        <button
          className="workspace-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          title={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          onClick={onToggleCollapsed}
        >
          <Chevron open={!collapsed} size={14} />
        </button>
        <a className="workspace-title" href={href({ name: "project", id: project.id, tab: "board" })} title={`${project.name} のカンバンを開く`}>
          <span className="workspace-avatar" aria-hidden>
            {initialOf(project.name)}
          </span>
          <span className="workspace-title-text">
            <span className="workspace-name">{project.name}</span>
            <span className="workspace-sub">{chatCount} チャット</span>
          </span>
        </a>
        {project.archived_at ? (
          <IconButton icon={ArchiveRestore} label={`${project.name} をアーカイブから戻す`} title="アーカイブから戻す" onClick={() => changeProject(project.id, { archived: false })} />
        ) : (
          <IconButton
            icon={Pin}
            size={13}
            className={cx("workspace-pin", project.pinned > 0 && "pinned")}
            label={project.pinned ? `${project.name} の固定をやめる` : `${project.name} を上に固定`}
            title={project.pinned ? "固定をやめる" : "上に固定"}
            aria-pressed={Boolean(project.pinned)}
            onClick={() => changeProject(project.id, { pinned: !project.pinned })}
          />
        )}
        <HeadCounts counts={counts} />
        {/* マウスを乗せたときだけ出す（右クリックのメニューにも同じものがある） */}
        <span className="workspace-hover-actions">
          {!collapsed && (
            <ChatGroupingMenu value={grouping} onChange={onGroupingChange} showArchived={showArchived} onShowArchived={onShowArchived} />
          )}
          <IconButton icon={FolderPlus} label={`${project.name} にグループを作成`} title="グループを作成" onClick={onCreateGroup} />
        </span>
        <IconButton
          icon={Plus}
          label={`${project.name} の新しいチャット`}
          title={groups.length > 0 ? "新しいチャット（作成先のグループを選ぶ）" : "新しいチャット（⌘N）"}
          size={15}
          className="workspace-new-chat"
          aria-haspopup={groups.length > 0 ? "menu" : undefined}
          aria-expanded={groups.length > 0 ? pickAt !== null : undefined}
          onClick={(e) => {
            // グループがあれば、どこに作るかを選んでもらう（開いているときに押したら閉じる）
            if (groups.length === 0) return openNewChat(project.id);
            if (pickAt) return setPickAt(null);
            const r = e.currentTarget.getBoundingClientRect();
            setPickAt({ x: r.left, y: r.bottom + 4 });
          }}
        />
      </div>
      {pickAt && (
        <GroupPickMenu
          x={pickAt.x}
          y={pickAt.y}
          groups={groups}
          ignore=".workspace-new-chat"
          onPick={(group) => openNewChat(project.id, group ? { group } : {})}
          onClose={() => setPickAt(null)}
        />
      )}
      {projectMenu.element}
    </>
  );
}
