import { ArchiveRestore, Pin, Plus } from "lucide-react";
import type { DragEvent } from "react";
import type { ProjectSummary, RunGroup } from "../../../../core/types";
import { cx } from "../../cx";
import { changeProject, confirmRestoreProject } from "../../projectOrder";
import { href, navigate, openNewChat } from "../../router";
import { Chevron } from "../Chevron";
import { GROUP_PICK_MENU_WIDTH, GroupPickMenu, groupPickMenuHeight } from "../menus/GroupPickMenu";
import { useAnchoredMenu } from "../menus/useAnchoredMenu";
import { IconButton } from "../IconButton";
import { HeadCounts, type StateFilter } from "./HeadCounts";
import { pressedLeftOfName } from "./GroupToggle";
import { useProjectMenu } from "./ProjectMenu";
import type { StateCounts } from "../../runState";

/**
 * サイドバーのプロジェクトの見出し（どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする）。
 * 左の矢印（名前より左のどこでも）を押すと、選ばずに開閉だけする。カードのほかの部分（中のボタンを除く）を押すと、選んでいて開いていれば閉じ、それ以外は選び直して開く（サイドバー全体で同じ）。
 * 出すのは、いつも使うものだけ: チャット一覧の開閉（矢印）・名前（押すとカンバン）・固定（固定しているかは色と塗りで分かる）・状態ごとのチャット数・新しいチャット（＋）。
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
  const pickMenu = useAnchoredMenu(".workspace-new-chat", GROUP_PICK_MENU_WIDTH);
  const projectMenu = useProjectMenu([project]);
  /**
   * カードの矢印以外を押したとき（サイドバー全体で同じ）: 選んでいて開いていれば閉じる。
   * それ以外（選んでいない・選んでいて閉じている）は、選び直して開く（カンバンを開き、チャット一覧も開く）
   */
  const press = () => {
    if (active && !collapsed) return onToggleCollapsed();
    navigate({ name: "project", id: project.id, tab: "board" });
    if (collapsed) onToggleCollapsed();
  };
  const pressLabel = active && !collapsed ? "チャット一覧を閉じる" : `${project.name} のカンバンを開く`;
  return (
    <>
      <div
        className={cx("workspace-head", active && "active", project.archived_at && "archived")}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える（右クリックで固定・アーカイブ）" : "右クリックで固定・アーカイブ"}
        onContextMenu={(e) => projectMenu.open(e, project, { onCreateGroup, collapse: { collapsed, toggle: onToggleCollapsed } })}
        onClick={(e) => {
          // カードの矢印以外のところを押すと、選んで開く / 開閉する。中のボタン（矢印・ピン・状態の数・＋）はそちらの動き
          if ((e.target as HTMLElement).closest("button, a, input, select")) return;
          // 名前より左（矢印のまわりの余白）は、矢印を押したのと同じく開閉だけ
          if (pressedLeftOfName(e, e.currentTarget.querySelector(".workspace-title"))) return onToggleCollapsed();
          press();
        }}
        {...headDrag}
      >
        {/* 開閉の矢印（プロジェクトの色。押すと、選んでいてもいなくても開閉だけする） */}
        <button
          className="workspace-toggle"
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
            // 名前を押しても、カードを押したのと同じ
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
          aria-expanded={groups.length > 0 ? pickMenu.isOpen : undefined}
          onClick={(e) => {
            // グループがあれば、どこに作るかを選んでもらう（開いているときに押したら閉じる）
            if (groups.length === 0) return openNewChat(project.id);
            pickMenu.toggle(e, groupPickMenuHeight(groups.length));
          }}
        />
      </div>
      {pickMenu.at && (
        <GroupPickMenu
          {...pickMenu.at}
          groups={groups}
          ignore={pickMenu.ignore}
          onPick={(group) => openNewChat(project.id, group ? { group } : {})}
          onClose={pickMenu.close}
        />
      )}
      {projectMenu.element}
    </>
  );
}
