import { Check, Clock, GitBranch, Layers, ListTree, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { IconButton } from "../IconButton";
import { clampToViewport, PopupMenu } from "../PopupMenu";

/**
 * サイドバーのチャット一覧の並べ方。保存の形式は今までのまま（"recent" / "status"）で、作業場所・セクションを足した
 */
export const CHAT_GROUPINGS = ["recent", "status", "worktree", "phase"] as const;
export type ChatGrouping = (typeof CHAT_GROUPINGS)[number];

const GROUPING_META: Record<ChatGrouping, { label: string; icon: LucideIcon }> = {
  recent: { label: "新しい順", icon: Clock },
  status: { label: "状態でまとめる", icon: ListTree },
  worktree: { label: "作業場所（ブランチ）でまとめる", icon: GitBranch },
  phase: { label: "セクションでまとめる", icon: Layers },
};

/** 並べ方のボタン（いまの並べ方のアイコン）。押すと並べ方を選ぶメニューを出す */
export function ChatGroupingMenu({ value, onChange }: { value: ChatGrouping; onChange: (value: ChatGrouping) => void }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <IconButton
        icon={GROUPING_META[value].icon}
        label="チャットの並べ方"
        title={`チャットの並べ方（いまは「${GROUPING_META[value].label}」）`}
        className="chat-grouping-button"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 170));
        }}
      />
      {at && <GroupingMenu {...at} value={value} onPick={onChange} onClose={() => setAt(null)} />}
    </>
  );
}

function GroupingMenu({ x, y, value, onPick, onClose }: { x: number; y: number; value: ChatGrouping; onPick: (value: ChatGrouping) => void; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuKeys(menuRef);
  return (
    <PopupMenu x={x} y={y} label="チャットの並べ方" ignore=".chat-grouping-button" menuRef={menuRef} onClose={onClose}>
      <div className="menu-label">チャットの並べ方</div>
      {CHAT_GROUPINGS.map((g) => {
        const Icon = GROUPING_META[g].icon;
        return (
          <button
            key={g}
            role="menuitemradio"
            aria-checked={g === value}
            onClick={() => {
              onClose();
              onPick(g);
            }}
          >
            <Icon size={14} aria-hidden />
            <span className="project-switch-item">{GROUPING_META[g].label}</span>
            {g === value && <Check size={14} aria-hidden />}
          </button>
        );
      })}
    </PopupMenu>
  );
}
