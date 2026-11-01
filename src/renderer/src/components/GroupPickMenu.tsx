import { Folder, Inbox, SquarePen } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RunGroup } from "../../../core/types";
import { clampToViewport, PopupMenu } from "./PopupMenu";

/**
 * 新しいチャットをどこに作るかを選ぶメニュー（グループがあるプロジェクトの＋を押したとき）。
 * group が undefined なら「グループなし」
 */
export function GroupPickMenu({
  x,
  y,
  groups,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  groups: RunGroup[];
  onPick: (group: number | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 開いたら先頭にピントを置き、↑↓ で項目を移る
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const pick = (group: number | undefined) => {
    onClose();
    onPick(group);
  };
  const at = clampToViewport(x, y, 230, 60 + groups.length * 34);

  return (
    <PopupMenu x={at.x} y={at.y} className="group-pick-menu" label="新しいチャットの作成先" menuRef={ref} onClose={onClose}>
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
