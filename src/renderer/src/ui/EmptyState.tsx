import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * 中身がない・見つからない画面の案内（アイコン・見出し・説明・操作のボタンの行・下に添えるもの（始め方の手順・移れる先の一覧など））。
 * 文 1 行だけで済ませず、何が起きているかと、次にできることを並べる
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  footer,
  className,
}: {
  icon: LucideIcon;
  title: string;
  /** 説明（なぜ空なのか・ここは何をする所か） */
  children?: ReactNode;
  /** 次にできることのボタン（いちばん大事なものを先に） */
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("empty-state", className)}>
      <span className="empty-state-icon">
        <Icon size={24} aria-hidden />
      </span>
      <h2 className="empty-state-title">{title}</h2>
      {children && <div className="empty-state-text">{children}</div>}
      {actions && <div className="empty-state-actions">{actions}</div>}
      {footer}
    </section>
  );
}
