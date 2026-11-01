import { SquarePen, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "../../cx";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import type { NewChatTarget, SidePanelController } from "./useSidePanel";

/** 列・グループに出す、送る前の新しいチャット（パネルで入力中）の下書き */
export function DraftCards({ panel, filter }: { panel: SidePanelController; filter: (target: NewChatTarget) => boolean }) {
  return panel.drafts
    .filter((d) => filter(d.target))
    .map((d) => <DraftCard key={d.key} active={panel.isShowingTab(d.key)} onOpen={() => panel.showTab(d.key)} onDelete={() => panel.closeTab(d.key)} />);
}

/** 下書きのカード。押すとそのタブを表示し、右クリックで開く・削除を選べる */
function DraftCard({ active, onOpen, onDelete }: { active: boolean; onOpen: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={cx("draft-card", active && "selected")}
        title="右側で入力中の新しいチャット（右クリックで削除）"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(clampToViewport(e.clientX, e.clientY, 220, 120));
        }}
      >
        <SquarePen size={14} aria-hidden />
        新しいチャット（入力中）
      </button>
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => (onOpen(), setMenu(null))}>
            <SquarePen size={14} /> 開く
          </button>
          <button role="menuitem" className="danger" onClick={() => (onDelete(), setMenu(null))}>
            <Trash2 size={14} /> 削除（入力中の内容は消えます）
          </button>
        </PopupMenu>
      )}
    </>
  );
}
