import { Folder, Inbox, SquarePen } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { RunGroup } from "../../../core/types";

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

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // ↑↓ で項目を移る
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const pick = (group: number | undefined) => {
    onClose();
    onPick(group);
  };

  // サイドバーの横スライド（transform）の中だと位置がずれるので、body の直下に出す
  return createPortal(
    <div
      ref={ref}
      className="menu group-pick-menu"
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 60 - groups.length * 34) }}
      role="menu"
      aria-label="新しいチャットの作成先"
    >
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
    </div>,
    document.body,
  );
}
