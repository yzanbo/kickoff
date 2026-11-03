import { X, type LucideIcon } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cx } from "../../cx";

/**
 * パネルのタブ 1 つ（右のパネル・下のパネルで共通）。名前を押すと表示し、× で閉じる。
 * extra は右のパネルで足す属性（ドラッグ・右クリックのメニュー）、className はドラッグで落とす位置の印など
 */
export function PanelTab({
  active,
  icon: Icon,
  iconClass,
  label,
  title,
  className,
  extra,
  onSelect,
  onClose,
}: {
  active: boolean;
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  /** 名前にマウスを乗せたときの説明（なければ名前） */
  title?: string;
  className?: string;
  extra?: HTMLAttributes<HTMLDivElement>;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cx("panel-tab", active && "active", className)} role="tab" aria-selected={active} {...extra}>
      <button className="panel-tab-label" onClick={onSelect} title={title ?? label}>
        <Icon size={12} className={iconClass} aria-hidden />
        <span>{label}</span>
      </button>
      <button className="panel-tab-close" aria-label={`${label} のタブを閉じる`} onClick={onClose}>
        <X size={12} />
      </button>
    </div>
  );
}
