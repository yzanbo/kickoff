import type { LucideIcon } from "lucide-react";
import { Chevron } from "../Chevron";

/** サイドバーのグループ（自分で作ったグループ・グループなし・アーカイブ済み）の開閉ボタン */
export function GroupToggle({ open, onToggle, icon: Icon, iconSize = 13 }: { open: boolean; onToggle: () => void; icon?: LucideIcon; iconSize?: number }) {
  return (
    <button className="custom-group-toggle" aria-expanded={open} title={open ? "閉じる" : "開く"} onClick={onToggle}>
      <Chevron open={open} />
      {Icon && <Icon size={iconSize} aria-hidden />}
    </button>
  );
}
