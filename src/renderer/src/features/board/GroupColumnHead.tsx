import { Folder, Plus } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import type { GroupBoardState } from "./useGroupBoard";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/**
 * グループのボードの列・リストのまとまりの見出し。group が null なら「No Group」。
 * 見出しをドラッグしてグループを並べ替え、名前のダブルクリックで名前を変え、右クリック・「…」でメニュー。
 * onNewChat: ＋でそのグループに新しいチャットを始める
 */
export function GroupColumnHead({ group, count, board, onNewChat }: { group: ChatGroup | null; count: number; board: GroupBoardState; onNewChat: () => void }) {
  if (!group) {
    return (
      <header className="column-head">
        <span className="column-title muted">{NO_GROUP_LABEL}</span>
        <span className="column-count">{count}</span>
        <span className="spacer" />
        <IconButton icon={Plus} label={`${NO_GROUP_LABEL} で新しいチャット`} title="新しいチャット" onClick={onNewChat} />
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
      <Folder size={13} className="muted" aria-hidden />
      {renaming ? (
        <InlineName initial={group.name} onSubmit={(name) => board.renameGroup(group, name)} onCancel={() => board.setRenaming(undefined)} />
      ) : (
        <span className="column-title" onDoubleClick={() => board.setRenaming(group.id)}>
          {group.name}
        </span>
      )}
      {/* 名前の編集中は、ほかの操作を隠す */}
      {!renaming && (
        <>
          <span className="column-count">{count}</span>
          <IconButton icon={Plus} label={`${group.name} に新しいチャット`} title={`「${group.name}」に新しいチャット`} className="group-add-chat" onClick={onNewChat} />
          {board.groupMenu.button(group)}
        </>
      )}
    </header>
  );
}
