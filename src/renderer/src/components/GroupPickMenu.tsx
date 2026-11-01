import { Folder, Inbox, SquarePen } from "lucide-react";
import { useRef } from "react";
import type { RunGroup } from "../../../core/types";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/**
 * 新しいチャットをどこに作るかを選ぶメニュー（グループがあるプロジェクトの＋を押したとき）。
 * group が undefined なら「グループなし」
 */
export function GroupPickMenu({
  x,
  y,
  groups,
  ignore,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  groups: RunGroup[];
  /** 開くボタンのセレクタ（押したらボタンの側で閉じる） */
  ignore?: string;
  onPick: (group: number | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);

  const pick = (group: number | undefined) => {
    onClose();
    onPick(group);
  };
  const at = clampToViewport(x, y, 230, 60 + groups.length * 34);

  return (
    <PopupMenu x={at.x} y={at.y} className="group-pick-menu" label="新しいチャットの作成先" ignore={ignore} menuRef={ref} onClose={onClose}>
      <div className="menu-label">
        <SquarePen size={12} aria-hidden /> 新しいチャットの作成先
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
