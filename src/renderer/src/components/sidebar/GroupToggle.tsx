import type { LucideIcon } from "lucide-react";
import { Chevron } from "../Chevron";

/**
 * サイドバーのまとまり（自分で作ったグループ・グループなし・固定・アーカイブ済み・並べ方のまとまり）の開閉のボタン。
 * 開閉は矢印だけのボタンにして、いつも薄い背景を付け、押すと開閉する場所だと分かるようにする（アイコンはボタンの外に添える）
 */
export function GroupToggle({ open, onToggle, icon: Icon, iconSize = 13 }: { open: boolean; onToggle: () => void; icon?: LucideIcon; iconSize?: number }) {
  return (
    <>
      <button type="button" className="custom-group-toggle" aria-expanded={open} title={open ? "閉じる" : "開く"} onClick={onToggle}>
        <Chevron open={open} />
      </button>
      {Icon && <Icon size={iconSize} className="custom-group-icon" aria-hidden />}
    </>
  );
}
