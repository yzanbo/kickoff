import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";

/**
 * 送信待ちの見出しのボタン（小さいボタン・アイコン・狭いときに隠す文字）。tone: primary = 送る（青）、look: outline = 足す・消す（枠だけ）。
 * children はアイコンと文字のあとに足すもの（メニューを開く ▾ など）
 */
export function QueueHeadButton({
  icon: Icon,
  label,
  tone,
  look,
  className,
  children,
  ...button
}: { icon: LucideIcon; label: string; tone?: "primary"; look?: "outline"; className?: string; children?: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "type">) {
  return (
    <button type="button" className={cx("btn", tone === "primary" && "btn-primary", "queued-head-btn", className)} data-size="sm" data-look={look} {...button}>
      <Icon size={12} aria-hidden />
      <span className="queued-head-label">{label}</span>
      {children}
    </button>
  );
}
