import type { ReactNode } from "react";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { cx } from "@/foundation/ui/lib/cx";
import type { Tabs } from "./useTabs";

export interface TabStripItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  /** 名前の右に添える数・印 */
  badge?: ReactNode;
  /** 閉じるボタンを出す（onClose があるとき） */
  closable?: boolean;
}

/**
 * タブの列を描く（役割とキーは useTabs）。閉じるボタンはタブの外の隣に置く（押せる物を入れ子にしない）。
 * 選んでいるタブに active のクラスを付ける
 */
export function TabStrip<K extends string>({
  tabs,
  items,
  onClose,
  className,
}: {
  tabs: Tabs<K>;
  items: readonly TabStripItem<K>[];
  onClose?(key: K): void;
  className?: string;
}) {
  return (
    <div className={cx("tab-strip", className)} {...tabs.listProps}>
      {items.map(({ key, label, icon, badge, closable }) => {
        const tab = tabs.tabProps(key);
        return (
          <span key={key} className={cx("tab-strip-item", tab["aria-selected"] && "active")}>
            <button type="button" className="tab-strip-tab" {...tab}>
              {icon}
              {label}
              {badge}
            </button>
            {closable && onClose && <CloseButton size={12} className="tab-strip-close" onClick={() => onClose(key)} />}
          </span>
        );
      })}
    </div>
  );
}
