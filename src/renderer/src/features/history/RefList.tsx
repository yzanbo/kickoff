import { useState, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";

/** 左の一覧の 1 つのまとまり（ブランチ・リモートなど。見出しで開閉。action は見出しの右のボタン。always なら空でも出す） */
export function RefSection({ title, count, action, always = false, children }: { title: string; count: number; action?: ReactNode; always?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  if (count === 0 && !always) return null;
  return (
    <section className="ref-section">
      <div className="change-group-row">
        <button className="change-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron open={open} />
          <span className="change-group-title">{title}</span>
        </button>
        {action}
      </div>
      {open && <ul className="ref-items">{children}</ul>}
    </section>
  );
}

/** 左の一覧の 1 行（押すとそのコミットを表で選ぶ。selected は押して選んでいる行（地の色）、active はいまのブランチ（太字）。actions はマウスを乗せたときに出すボタン、onContextMenu は右クリックのメニュー） */
export function RefItem({
  icon,
  name,
  title,
  note,
  active,
  selected,
  onClick,
  actions,
  depth = 0,
  onContextMenu,
}: {
  icon: ReactNode;
  name: string;
  title?: string;
  note?: ReactNode;
  active?: boolean;
  selected?: boolean;
  onClick: () => void;
  actions?: ReactNode;
  depth?: number;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  return (
    <li className={cx(Boolean(actions) && "change-item", selected && "selected")}>
      <button className={cx("ref-item", active && "current", selected && "selected")} aria-current={selected || undefined} style={{ paddingLeft: 22 + depth * 14 }} title={title ?? name} onClick={onClick} onContextMenu={onContextMenu}>
        {icon}
        <span className="ref-name">{name}</span>
        {note && <span className="ref-note">{note}</span>}
      </button>
      {actions && <span className="row-actions">{actions}</span>}
    </li>
  );
}
