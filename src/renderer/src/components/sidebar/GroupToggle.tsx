import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { Chevron } from "../Chevron";

/**
 * サイドバーのまとまり（自分で作ったグループ・グループなし・固定・アーカイブ済み・並べ方のまとまり）の開閉のボタン。
 * 開閉は矢印だけのボタンにする（アイコンはボタンの外に添える。名前より左を押したときは、どこでも開閉だけ: pressedLeftOfName）
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

/**
 * 見出しの名前より左（開閉の矢印とそのまわりの余白・添えたアイコン）を押したか。
 * 矢印のボタンは小さいので、そこを押したときも選ばずに開閉だけにする（プロジェクトのカード・グループの見出しで共通）
 */
export function pressedLeftOfName(e: MouseEvent, name: Element | null) {
  return name !== null && e.clientX < name.getBoundingClientRect().left;
}
