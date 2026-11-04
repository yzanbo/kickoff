import { Folder, Inbox, SquarePen } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";

/** メニューの幅と、グループの数から決まるおおよその高さ（画面からはみ出さない位置にするため） */
export const GROUP_PICK_MENU_WIDTH = 230;
export const groupPickMenuHeight = (groups: number) => 60 + groups * 34;

/**
 * グループを選ぶメニュー（新しいチャットの作成先・まとめて選んだチャットの移動先）。
 * group が undefined なら「グループなし」
 */
export function GroupPickMenu({
  x,
  y,
  groups,
  ignore,
  title = "新しいチャットの作成先",
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  groups: ChatGroup[];
  /** 開くボタンのセレクタ（押したらボタンの側で閉じる） */
  ignore?: string;
  /** メニューの見出し */
  title?: string;
  onPick: (group: number | undefined) => void;
  onClose: () => void;
}) {

  const at = clampToViewport(x, y, GROUP_PICK_MENU_WIDTH, groupPickMenuHeight(groups.length));

  return (
    <PopupMenu x={at.x} y={at.y} className="group-pick-menu" label={title} ignore={ignore} onClose={onClose}>
      <div className="menu-label">
        <SquarePen size={12} aria-hidden /> {title}
      </div>
      {groups.map((g) => (
        <MenuItem key={g.id} onSelect={() => onPick(g.id)}>
          <Folder size={14} /> {g.name}
        </MenuItem>
      ))}
      <MenuItem className="muted-item" onSelect={() => onPick(undefined)}>
        <Inbox size={14} /> グループなし
      </MenuItem>
    </PopupMenu>
  );
}
