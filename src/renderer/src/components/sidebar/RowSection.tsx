import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GroupToggle } from "./GroupToggle";

/** サイドバーの、開閉できるチャットのまとまり（固定・アーカイブ済み）。見出しは「グループなし」と同じ形で、中身は段下げして縦の線でつなぐ */
export function RowSection({
  icon,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="row-section">
      <div className="custom-group-head ungrouped">
        <GroupToggle open={open} onToggle={onToggle} icon={icon} iconSize={12} />
        <button className="custom-group-name ungrouped-name" onClick={onToggle}>
          {label}
        </button>
        <span className="custom-group-count">{count}</span>
      </div>
      {open && children}
    </div>
  );
}
