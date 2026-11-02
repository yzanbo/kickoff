import { ArchiveRestore, Pin, Plus } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { ProjectSummary, RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { changeProject, confirmRestoreProject } from "../../projectOrder";
import { href, navigate, openNewChat } from "../../router";
import { Chevron } from "../Chevron";
import { GroupPickMenu } from "../GroupPickMenu";
import { IconButton } from "../IconButton";
import { HeadCounts, type StateFilter } from "./HeadCounts";
import { useProjectMenu } from "./ProjectMenu";
import type { StateCounts } from "./sidebarFlags";

/**
 * サイドバーのプロジェクトの見出し（どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする）。
 * サイドバー全体で、矢印を押すと開閉、それ以外を押すと選ぶ: 左の四角の矢印で開閉し、カードのほかの部分（中のボタンを除く）を押すとこのプロジェクトを選ぶ（カンバンを開く。閉じていればチャット一覧も開く。プロジェクトだけの例外）。
 * 出すのは、いつも使うものだけ: チャット一覧の開閉（頭文字。乗せると矢印に変わる）・名前（押すとカンバン）・固定（固定しているかは色と塗りで分かる）・状態ごとのチャット数・新しいチャット（＋）。
 * マウスを乗せたときだけ出す操作は作らない。ほかの操作（固定する・グループを作成など）は右クリックのメニュー、
 * すべてのプロジェクトに効く設定（チャットの並べ方など）は一覧の上の見出しの行に置く。
 * しまった（アーカイブした）プロジェクトは、ピンの代わりに戻すボタンを出す。
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
  stateFilter,
  onStateFilter,
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
  /** 状態の数を押して絞っている状態 */
  stateFilter: StateFilter | null;
  onStateFilter: (state: StateFilter | null) => void;
  onCreateGroup: () => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}) {
  // ＋を押したときの、作成先のグループを選ぶメニュー
  const [pickAt, setPickAt] = useState<{ x: number; y: number } | null>(null);
  const projectMenu = useProjectMenu([project]);
  /**
   * カードの矢印以外を押したとき: このプロジェクトを選ぶ（カンバンを開く）。
   * プロジェクトだけは例外で、チャット一覧が閉じていれば開く（閉じるのは左の矢印だけ。グループは選んでも開閉しない）
   */
  const press = () => {
    navigate({ name: "project", id: project.id, tab: "board" });
    if (collapsed) onToggleCollapsed();
  };
  const pressLabel = `${project.name} のカンバンを開く`;
  return (
    <>
      <div
        className={cx("workspace-head", active && "active", project.archived_at && "archived")}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える（右クリックで固定・アーカイブ）" : "右クリックで固定・アーカイブ"}
        onContextMenu={(e) => projectMenu.open(e, project, { onCreateGroup, collapse: { collapsed, toggle: onToggleCollapsed } })}
        onClick={(e) => {
          // カードの矢印以外のところを押すと選ぶ。中のボタン（矢印・ピン・状態の数・＋）はそちらの動き
          if ((e.target as HTMLElement).closest("button, a, input, select")) return;
          press();
        }}
        {...headDrag}
      >
        {/* 開閉のボタン（プロジェクトの色の四角に、いつも開閉の矢印を出す。押すと、選んでいてもいなくても開閉する） */}
        <button
          className="workspace-avatar workspace-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `${project.name} のチャット一覧を開く` : `${project.name} のチャット一覧を閉じる`}
          title={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          onClick={onToggleCollapsed}
        >
          <Chevron open={!collapsed} size={15} />
        </button>
        <a
          className="workspace-title"
          href={href({ name: "project", id: project.id, tab: "board" })}
          title={pressLabel}
          onClick={(e) => {
            // 名前を押しても、カードを押したのと同じ（選ぶ）
            e.preventDefault();
            press();
          }}
        >
          <span className="workspace-title-text">
            <span className="workspace-name">{project.name}</span>
            <span className="workspace-sub">{chatCount} チャット</span>
          </span>
        </a>
        {project.archived_at ? (
          <IconButton icon={ArchiveRestore} label={`${project.name} をアーカイブから戻す`} title="アーカイブから戻す" onClick={() => void confirmRestoreProject(project)} />
        ) : (
          // いつも出し、固定しているか見た目で分かるようにする（固定: プロジェクトの色で塗る / していない: 薄い灰の線）
          <IconButton
            icon={Pin}
            size={13}
            className={cx("workspace-pin", project.pinned > 0 && "pinned")}
            iconClassName={project.pinned > 0 ? "pin-filled" : undefined}
            label={project.pinned ? `${project.name} の固定をやめる` : `${project.name} を上に固定`}
            title={project.pinned ? "上に固定しています（押すと固定をやめる）" : "上に固定"}
            aria-pressed={project.pinned > 0}
            onClick={() => changeProject(project.id, { pinned: !project.pinned })}
          />
        )}
        <HeadCounts counts={counts} filter={stateFilter} onFilter={onStateFilter} />
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
