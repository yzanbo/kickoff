import type { CSSProperties } from "react";
import { Folder, SquarePen } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { ToneChip } from "@/ui/ToneChip";
import type { GroupBoardState } from "./useGroupBoard";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";
import { UNGROUPED_SORT_ID } from "@/features/group/groups";
import { NewChatItem } from "@/features/chat/NewChatItem";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * グループの列・リストのまとまりの見出し（全プロジェクトのボードの「列: グループ」）。group が null なら「No Group」。
 * 見出しをドラッグしてグループ・「No Group」を並べ替え、名前のダブルクリックで名前を変え、右クリック・「…」でメニュー（「No Group」の右クリックは「新しいチャット」だけ）。
 * メニューのいちばん上の「新しいチャット」には、どこで始めるか（グループ・作業場所の札）を添える（チャットの右クリックと同じ NewChatItem）。
 * 名前と件数は列の色の札（ToneChip）に入れる: グループはその色（ChatGroup.hue。サイドバー・タブのまとまりと同じ）、「No Group」は灰。
 * onNewChat: ＋でそのグループに新しいチャットを始める
 */
export function GroupColumnHead({ group, count, board, onNewChat }: { group: ChatGroup | null; count: number; board: GroupBoardState; onNewChat: () => void }) {
  if (!group) return <UngroupedColumnHead count={count} board={board} onNewChat={onNewChat} />;
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
        <ToneChip
          className="group-hued"
          style={{ "--group-hue": group.hue } as CSSProperties}
          icon={<Folder size={13} aria-hidden />}
          label={group.name}
          count={count}
          onLabelDoubleClick={() => board.setRenaming(group.id)}
        />
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

/** 「No Group」の列の見出し（ドラッグで並べ替え・鉛筆と右クリックの「新しいチャット」でグループなしのチャットを始める） */
function UngroupedColumnHead({ count, board, onNewChat }: { count: number; board: GroupBoardState; onNewChat: () => void }) {
  const menu = useContextMenu();
  return (
    <header
      className="column-head group-column-head"
      draggable
      title="ドラッグで並べ替える（右クリックで新しいチャット）"
      onContextMenu={(e) => {
        e.stopPropagation();
        menu.open(e);
      }}
      {...board.reorder.handle(UNGROUPED_SORT_ID)}
    >
      <ToneChip label={NO_GROUP_LABEL} count={count} />
      <span className="spacer" />
      <IconButton icon={SquarePen} label={`${NO_GROUP_LABEL} で新しいチャット`} title="新しいチャット" onClick={onNewChat} />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`「${NO_GROUP_LABEL}」の操作`} onClose={menu.close}>
          <NewChatItem place={{ projectId: board.projectId }} sameAs="" onSelect={onNewChat} />
        </PopupMenu>
      )}
    </header>
  );
}
