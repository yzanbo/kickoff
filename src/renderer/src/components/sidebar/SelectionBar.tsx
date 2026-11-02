import { Archive, ArchiveRestore, FolderInput, MailOpen, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Run, RunGroup } from "../../../../core/types";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { confirmArchiveRuns, confirmDeleteRuns, markRunsSeen, moveRunsToGroup } from "../../runActions";
import { GroupPickMenu } from "../menus/GroupPickMenu";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import type { ChatSelection } from "./chatSelection";

/**
 * サイドバーで複数選んだチャットを、まとめて操作する欄（選んでいるときだけ、一覧の下に出す）と、選んだ行の右クリックのメニュー。
 * アーカイブ（どれもアーカイブ済みなら戻す）・グループへ移す（同じプロジェクトのものだけのとき）・既読にする・削除。Esc で選ぶのをやめる
 */
export function SelectionBar({ selection, runs, groups }: { selection: ChatSelection; runs: Record<number, Run[]>; groups: Record<number, RunGroup[]> }) {
  const [moveAt, setMoveAt] = useState<{ x: number; y: number } | null>(null);
  const picked = Object.values(runs)
    .flat()
    .filter((r) => selection.has(r.id));
  const projectIds = new Set(picked.map((r) => r.project_id));
  // グループへ移せるのは、同じプロジェクトのチャットだけを選んでいるとき
  const moveGroups = projectIds.size === 1 ? (groups[[...projectIds][0]] ?? []) : null;
  const allArchived = picked.length > 0 && picked.every((r) => r.archived_at);
  const unread = picked.some((r) => r.attention);

  // Esc で選ぶのをやめる（入力欄・ダイアログ・メニューの中の Esc は、そちらに任せる）
  useWindowEvent("keydown", (e) => {
    if (e.key !== "Escape" || selection.ids.size === 0 || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [role=dialog], [role=menu]")) return;
    selection.clear();
  });

  if (picked.length === 0) return null;
  const done = () => selection.clear();
  const actions = {
    archive: () => void confirmArchiveRuns(picked).then((ok) => ok && done()),
    seen: () => void markRunsSeen(picked).then(done),
    remove: () => void confirmDeleteRuns(picked).then((ok) => ok && done()),
    move: (at: { x: number; y: number }) => setMoveAt(at),
  };
  return (
    <>
      <div className="selection-bar" role="toolbar" aria-label="選んだチャットの操作">
        <div className="selection-bar-head">
          <span className="selection-bar-count">{picked.length} 件を選択中</span>
          <button className="link-button selection-bar-clear" onClick={done} title="選ぶのをやめる（Esc）">
            <X size={12} aria-hidden /> 解除
          </button>
        </div>
        <div className="selection-bar-actions">
          <button className="btn btn-sm" onClick={actions.archive}>
            {allArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {allArchived ? "戻す" : "アーカイブ"}
          </button>
          {moveGroups && (
            <button
              className="btn btn-sm selection-bar-move"
              onClick={(e) => {
                if (moveAt) return setMoveAt(null);
                const r = e.currentTarget.getBoundingClientRect();
                actions.move({ x: r.left, y: r.top - 8 - (60 + moveGroups.length * 34) });
              }}
            >
              <FolderInput size={13} /> 移動
            </button>
          )}
          <button className="btn btn-sm" onClick={actions.seen} disabled={!unread} title={unread ? "確認待ちの印を消す" : "確認待ちのチャットはありません"}>
            <MailOpen size={13} /> 既読
          </button>
          <button className="btn btn-sm selection-bar-delete" onClick={actions.remove}>
            <Trash2 size={13} /> 削除
          </button>
        </div>
      </div>
      {moveAt && moveGroups && (
        <GroupPickMenu
          {...moveAt}
          groups={moveGroups}
          title="移動先のグループ"
          ignore=".selection-bar-move"
          onPick={(group) => void moveRunsToGroup(picked, group ?? null).then(done)}
          onClose={() => setMoveAt(null)}
        />
      )}
      {selection.menuAt && (
        <SelectionMenu
          {...selection.menuAt}
          count={picked.length}
          allArchived={allArchived}
          unread={unread}
          canMove={Boolean(moveGroups)}
          onArchive={actions.archive}
          onMove={() => selection.menuAt && actions.move(selection.menuAt)}
          onSeen={actions.seen}
          onDelete={actions.remove}
          onClear={done}
          onClose={selection.closeMenu}
        />
      )}
    </>
  );
}

/** 選んだチャットを右クリックしたときのメニュー（まとめて操作） */
function SelectionMenu({
  x,
  y,
  count,
  allArchived,
  unread,
  canMove,
  onArchive,
  onMove,
  onSeen,
  onDelete,
  onClear,
  onClose,
}: {
  x: number;
  y: number;
  count: number;
  allArchived: boolean;
  unread: boolean;
  canMove: boolean;
  onArchive: () => void;
  onMove: () => void;
  onSeen: () => void;
  onDelete: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const at = clampToViewport(x, y, 230, 230);
  const item = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <PopupMenu x={at.x} y={at.y} label={`${count} 件のチャットの操作`} onClose={onClose}>
      <div className="menu-label">{count} 件を選択中</div>
      <button role="menuitem" onClick={item(onArchive)}>
        {allArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {allArchived ? "まとめてアーカイブから戻す" : "まとめてアーカイブ"}
      </button>
      {canMove && (
        <button role="menuitem" onClick={item(onMove)}>
          <FolderInput size={14} /> グループへ移す
        </button>
      )}
      {unread && (
        <button role="menuitem" onClick={item(onSeen)}>
          <MailOpen size={14} /> まとめて既読にする
        </button>
      )}
      <button role="menuitem" className="danger" onClick={item(onDelete)}>
        <Trash2 size={14} /> まとめて削除…
      </button>
      <div className="menu-separator" role="separator" />
      <button role="menuitem" onClick={item(onClear)}>
        <X size={14} /> 選ぶのをやめる
      </button>
    </PopupMenu>
  );
}
