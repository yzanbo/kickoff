import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../cx";
import { Collapse } from "../Collapse";
import { GroupToggle } from "./GroupToggle";

/** サイドバーの、開閉できるチャットのまとまり（固定・アーカイブ済み）。見出しは「グループなし」と同じ形で、中身は段下げして縦の線でつなぐ */
export function RowSection({
  icon,
  label,
  count,
  open,
  onToggle,
  indent = true,
  className,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  /** 中身を段下げして縦の線でつなぐ（ボードのカードには付けない） */
  indent?: boolean;
  /** まとまりの種類の見た目（pinned: 固定。ピンを固定の色で塗る） */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("row-section", className)}>
      <div className="custom-group-head ungrouped">
        <GroupToggle open={open} onToggle={onToggle} icon={icon} iconSize={12} />
        <button className="custom-group-name ungrouped-name" onClick={onToggle}>
          {label}
        </button>
        <span className="custom-group-count">{count}</span>
      </div>
      <Collapse open={open} indent={indent}>
        {children}
      </Collapse>
    </div>
  );
}
