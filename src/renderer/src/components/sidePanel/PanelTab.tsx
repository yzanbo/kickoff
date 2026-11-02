import { X, type LucideIcon } from "lucide-react";
import { cx } from "../../cx";

/** パネルのタブ 1 つ（右のパネル・下のパネルで共通）。名前を押すと表示し、× で閉じる */
export function PanelTab({
  active,
  icon: Icon,
  iconClass,
  label,
  title,
  onSelect,
  onClose,
}: {
  active: boolean;
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  /** 名前にマウスを乗せたときの説明（なければ名前） */
  title?: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cx("panel-tab", active && "active")} role="tab" aria-selected={active}>
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
