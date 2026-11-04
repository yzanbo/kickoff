import { useState, type ReactNode } from "react";
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

/** 左の一覧の 1 行（押すとそのコミットを表で選ぶ。actions はマウスを乗せたときに出すボタン） */
export function RefItem({
  icon,
  name,
  title,
  note,
  active,
  onClick,
  actions,
  depth = 0,
}: {
  icon: ReactNode;
  name: string;
  title?: string;
  note?: ReactNode;
  active?: boolean;
  onClick: () => void;
  actions?: ReactNode;
  depth?: number;
}) {
  return (
    <li className={actions ? "change-item" : undefined}>
      <button className={cx("ref-item", active && "current")} style={{ paddingLeft: 22 + depth * 14 }} title={title ?? name} onClick={onClick}>
        {icon}
        <span className="ref-name">{name}</span>
        {note && <span className="ref-note">{note}</span>}
      </button>
      {actions && <span className="row-actions">{actions}</span>}
    </li>
  );
}
