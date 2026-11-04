import { Archive, ArchiveRestore, FolderInput, MailOpen, Trash2, X } from "lucide-react";
import type { Chat, ChatGroup } from "@shared/types";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { confirmArchiveChats, confirmDeleteChats, markChatsSeen, moveChatsToGroup } from "@/features/chat/chatActions";
import { GroupPickMenu } from "@/features/group/GroupPickMenu";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { ChatSelection } from "./chatSelection";

/**
 * サイドバーで複数選んだチャットを、まとめて操作する欄（選んでいるときだけ、一覧の下に出す）と、選んだ行の右クリックのメニュー。
 * アーカイブ（どれもアーカイブ済みなら戻す）・グループへ移す（同じプロジェクトのものだけのとき）・既読にする・削除。Esc で選ぶのをやめる
 */
export function SelectionBar({ selection, chats, groups }: { selection: ChatSelection; chats: Record<number, Chat[]>; groups: Record<number, ChatGroup[]> }) {
  // 移動先のグループを選ぶメニュー（欄の「移動」はボタンの上に、右クリックのメニューの「グループへ移す」はそのメニューと同じ場所に開く）
  const moveMenu = useContextMenu({ side: "above", gap: 8 });
  const picked = Object.values(chats)
    .flat()
    .filter((r) => selection.has(r.id));
  const projectIds = new Set(picked.map((r) => r.project_id));
  // グループへ移せるのは、同じプロジェクトのチャットだけを選んでいるとき
  const moveGroups = projectIds.size === 1 ? (groups[[...projectIds][0]] ?? []) : null;
  const allArchived = picked.length > 0 && picked.every((r) => r.archived_at);
  const unread = picked.some((r) => r.unread);

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
    archive: () => void confirmArchiveChats(picked).then((ok) => ok && done()),
    seen: () => void markChatsSeen(picked).then(done),
    remove: () => void confirmDeleteChats(picked).then((ok) => ok && done()),
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
            <button className="btn btn-sm selection-bar-move" onClick={moveMenu.toggle}>
              <FolderInput size={13} /> 移動
            </button>
          )}
          <button className="btn btn-sm" onClick={actions.seen} disabled={!unread} title={unread ? "未読の印を消す" : "未読のチャットはありません"}>
            <MailOpen size={13} /> 既読
          </button>
          <button className="btn btn-sm selection-bar-delete" onClick={actions.remove}>
            <Trash2 size={13} /> 削除
          </button>
        </div>
      </div>
      {moveMenu.menu && moveGroups && (
        <GroupPickMenu
          at={moveMenu.menu.at}
          groups={moveGroups}
          title="移動先のグループ"
          ignore=".selection-bar-move"
          onPick={(group) => void moveChatsToGroup(picked, group ?? null).then(done)}
          onClose={moveMenu.close}
        />
      )}
      {selection.menuAt && (
        <SelectionMenu
          at={selection.menuAt}
          count={picked.length}
          allArchived={allArchived}
          unread={unread}
          canMove={Boolean(moveGroups)}
          onArchive={actions.archive}
          onMove={() => selection.menuAt && moveMenu.openAt(selection.menuAt)}
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
  at,
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
  at: Placement;
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
  return (
    <PopupMenu at={at} label={`${count} 件のチャットの操作`} onClose={onClose}>
      <div className="menu-label">{count} 件を選択中</div>
      <MenuItem onSelect={onArchive}>
        {allArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {allArchived ? "まとめてアーカイブから戻す" : "まとめてアーカイブ"}
      </MenuItem>
      {canMove && (
        <MenuItem onSelect={onMove}>
          <FolderInput size={14} /> グループへ移す
        </MenuItem>
      )}
      {unread && (
        <MenuItem onSelect={onSeen}>
          <MailOpen size={14} /> まとめて既読にする
        </MenuItem>
      )}
      <MenuItem danger onSelect={onDelete}>
        <Trash2 size={14} /> まとめて削除…
      </MenuItem>
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={onClear}>
        <X size={14} /> 選ぶのをやめる
      </MenuItem>
    </PopupMenu>
  );
}
