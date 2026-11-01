import { Clock, FolderPlus, ListTree, Plus } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { ProjectSummary, RunGroup } from "../../../../core/types";
import { initialOf } from "../../projectColor";
import { href, openNewChat } from "../../router";
import { Chevron } from "../Chevron";
import { GroupPickMenu } from "../GroupPickMenu";
import { IconButton } from "../IconButton";

/**
 * サイドバーのプロジェクトの見出し（どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする）。
 * 左のボタン: チャット一覧の開閉 / 名前: プロジェクトのカンバンを表示 / 右: まとめ方・グループを作成・新しいチャット
 */
export function WorkspaceHead({
  project,
  groups,
  active,
  collapsed,
  onToggleCollapsed,
  chatCount,
  waitingCount,
  grouping,
  onToggleGrouping,
  onCreateGroup,
  headDrag,
}: {
  project: ProjectSummary;
  groups: RunGroup[];
  active: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  chatCount: number;
  waitingCount: number;
  grouping: "recent" | "status";
  onToggleGrouping: () => void;
  onCreateGroup: () => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}) {
  // ＋を押したときの、作成先のグループを選ぶメニュー
  const [pickAt, setPickAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <div
        className={`workspace-head ${active ? "active" : ""}`}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える" : undefined}
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
        {waitingCount > 0 && (
          <span className="count-badge" title="回答待ちのチャット" aria-label={`回答待ち ${waitingCount} 件`}>
            {waitingCount}
          </span>
        )}
        {!collapsed && (
          <IconButton
            icon={grouping === "recent" ? ListTree : Clock}
            label={grouping === "recent" ? "ステータスでまとめる" : "新しい順に並べる"}
            onClick={onToggleGrouping}
          />
        )}
        <IconButton icon={FolderPlus} label={`${project.name} にグループを作成`} title="グループを作成" onClick={onCreateGroup} />
        <IconButton
          icon={Plus}
          label={`${project.name} の新しいチャット`}
          title={groups.length > 0 ? "新しいチャット（作成先のグループを選ぶ）" : "新しいチャット（⌘N）"}
          size={15}
          aria-haspopup={groups.length > 0 ? "menu" : undefined}
          onClick={(e) => {
            // グループがあれば、どこに作るかを選んでもらう
            if (groups.length === 0) return openNewChat(project.id);
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
          onPick={(group) => openNewChat(project.id, group ? { group } : {})}
          onClose={() => setPickAt(null)}
        />
      )}
    </>
  );
}
