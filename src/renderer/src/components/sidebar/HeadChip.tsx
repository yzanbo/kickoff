import { ChevronDown, type LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { cx } from "../../cx";

/**
 * プロジェクト一覧の上の見出しの行の、メニューを開くボタン（何に効くかを文字で出す: 「プロジェクト」「チャット」）。
 * 先頭のアイコンはいまの状態（並べ方など）。狭いときは先頭のアイコン → ▾ の順に隠す
 */
export function HeadChip({
  icon: Icon,
  label,
  title,
  open,
  className,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  open: boolean;
  /** 開いているときに押したら閉じるため、メニューの ignore に渡すクラス */
  className: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className={cx("head-chip", className, open && "active")} title={title} aria-haspopup="menu" aria-expanded={open} onClick={onClick}>
      <Icon size={13} className="head-chip-icon" aria-hidden />
      <span className="head-chip-label">{label}</span>
      <ChevronDown size={12} className="head-chip-caret" aria-hidden />
    </button>
  );
}
