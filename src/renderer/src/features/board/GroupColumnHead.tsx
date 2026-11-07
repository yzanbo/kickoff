import type { CSSProperties } from "react";
import { Folder, SquarePen } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import type { GroupBoardState } from "./useGroupBoard";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { UNGROUPED_SORT_ID } from "@/features/group/groups";

/**
 * グループのボードの列・リストのまとまりの見出し。group が null なら「No Group」。
 * 見出しをドラッグしてグループ・「No Group」を並べ替え、名前のダブルクリックで名前を変え、右クリック・「…」でメニュー（「No Group」は並べ替えだけ）。
 * 名前と件数は列の色の札（.column-chip）に入れる: グループはその色（ChatGroup.hue。サイドバー・タブのまとまりと同じ）、「No Group」は灰。
 * onNewChat: ＋でそのグループに新しいチャットを始める
 */
export function GroupColumnHead({ group, count, board, onNewChat }: { group: ChatGroup | null; count: number; board: GroupBoardState; onNewChat: () => void }) {
  if (!group) {
    return (
      <header className="column-head group-column-head" draggable title="ドラッグで並べ替える" {...board.reorder.handle(UNGROUPED_SORT_ID)}>
        <span className="column-chip">
          <span className="column-title">{NO_GROUP_LABEL}</span>
          <span className="column-count">{count}</span>
        </span>
        <span className="spacer" />
        <IconButton icon={SquarePen} label={`${NO_GROUP_LABEL} で新しいチャット`} title="新しいチャット" onClick={onNewChat} />
      </header>
    );
  }
  const renaming = board.renaming === group.id;
  return (
    <header
      className="column-head group-column-head"
      draggable={!renaming}
      title="ドラッグでグループを並べ替える（右クリックでメニュー）"
      onContextMenu={(e) => board.groupMenu.openFor(group, e)}
      {...board.reorder.handle(group.id)}
    >
      {renaming ? (
        <>
          <Folder size={13} className="muted" aria-hidden />
          <InlineName initial={group.name} onSubmit={(name) => board.renameGroup(group, name)} onCancel={() => board.setRenaming(undefined)} />
        </>
      ) : (
        <span className="column-chip group-hued" style={{ "--group-hue": group.hue } as CSSProperties}>
          <Folder size={13} aria-hidden />
          <span className="column-title" onDoubleClick={() => board.setRenaming(group.id)}>
            {group.name}
          </span>
          <span className="column-count">{count}</span>
        </span>
      )}
      {/* 名前の編集中は、ほかの操作を隠す */}
      {!renaming && (
        <>
          <IconButton icon={SquarePen} label={`${group.name} に新しいチャット`} title={`「${group.name}」に新しいチャット`} className="group-add-chat" onClick={onNewChat} />
          {board.groupMenu.button(group)}
        </>
      )}
    </header>
  );
}
