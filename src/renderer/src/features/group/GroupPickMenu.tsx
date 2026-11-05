import { Folder, Inbox, SquarePen } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/**
 * グループを選ぶメニュー（新しいチャットの作成先・まとめて選んだチャットの移動先）。
 * group が undefined なら「No Group」
 */
export function GroupPickMenu({
  at,
  groups,
  ignore,
  title = "新しいチャットの作成先",
  onPick,
  onClose,
}: {
  at: Placement;
  groups: ChatGroup[];
  /** 開くボタンのセレクタ（押したらボタンの側で閉じる） */
  ignore?: string;
  /** メニューの見出し */
  title?: string;
  onPick: (group: number | undefined) => void;
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} className="group-pick-menu" label={title} ignore={ignore} onClose={onClose}>
      <div className="menu-label">
        <SquarePen size={12} aria-hidden /> {title}
      </div>
      {groups.map((g) => (
        <MenuItem key={g.id} onSelect={() => onPick(g.id)}>
          <Folder size={14} /> {g.name}
        </MenuItem>
      ))}
      <MenuItem className="muted-item" onSelect={() => onPick(undefined)}>
        <Inbox size={14} /> {NO_GROUP_LABEL}
      </MenuItem>
    </PopupMenu>
  );
}
