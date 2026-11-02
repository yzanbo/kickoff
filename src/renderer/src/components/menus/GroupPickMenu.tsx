import { Folder, Inbox, SquarePen } from "lucide-react";
import type { RunGroup } from "../../../../core/types";
import { clampToViewport, PopupMenu } from "../PopupMenu";

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
  groups: RunGroup[];
  /** 開くボタンのセレクタ（押したらボタンの側で閉じる） */
  ignore?: string;
  /** メニューの見出し */
  title?: string;
  onPick: (group: number | undefined) => void;
  onClose: () => void;
}) {

  const pick = (group: number | undefined) => {
    onClose();
    onPick(group);
  };
  const at = clampToViewport(x, y, 230, 60 + groups.length * 34);

  return (
    <PopupMenu x={at.x} y={at.y} className="group-pick-menu" label={title} ignore={ignore} onClose={onClose}>
      <div className="menu-label">
        <SquarePen size={12} aria-hidden /> {title}
      </div>
      {groups.map((g) => (
        <button key={g.id} role="menuitem" onClick={() => pick(g.id)}>
          <Folder size={14} /> {g.name}
        </button>
      ))}
      <button role="menuitem" className="muted-item" onClick={() => pick(undefined)}>
        <Inbox size={14} /> グループなし
      </button>
    </PopupMenu>
  );
}
