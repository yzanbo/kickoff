import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { RunGroup } from "../../../core/types";

/**
 * グループの「…」メニュー（名前を変更・削除）。ホバーで表示が変わらないよう、「…」ボタンはいつも出しておき、
 * 見出しの右クリックでも同じメニューを開く。1 つの画面（サイドバーのプロジェクト・グループのボード）で 1 つ使う
 */
export function useGroupMenu({ onRename, onDelete }: { onRename: (group: RunGroup) => void; onDelete: (group: RunGroup) => void }) {
  const [open, setOpen] = useState<{ group: RunGroup; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(null);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const openFor = (group: RunGroup, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen({ group, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 110) });
  };

  /** 見出しに置く「…」ボタン */
  const button = (group: RunGroup) => (
    <button
      className="icon-button group-menu-button"
      title="メニュー（名前を変更・削除）"
      aria-label={`${group.name} のメニュー`}
      aria-haspopup="menu"
      onClick={(e) => openFor(group, e)}
    >
      <MoreHorizontal size={14} />
    </button>
  );

  // サイドバーの横スライド（transform）の中だと位置がずれるので、body の直下に出す
  const menu =
    open &&
    createPortal(
    <div ref={ref} className="menu" style={{ left: open.x, top: open.y }} role="menu">
      <button role="menuitem" onClick={() => (setOpen(null), onRename(open.group))}>
        <Pencil size={14} /> 名前を変更
      </button>
      <button role="menuitem" className="danger" onClick={() => (setOpen(null), onDelete(open.group))}>
        <Trash2 size={14} /> グループを削除
      </button>
    </div>,
    document.body,
    );

  return { button, menu, openFor };
}
