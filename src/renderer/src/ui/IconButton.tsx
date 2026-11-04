import { RefreshCw, X, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

interface IconProps {
  /** アイコンの大きさ（px） */
  size?: number;
  iconClassName?: string;
}

/**
 * アイコンだけのボタン。label は読み上げ（aria-label）と、マウスを乗せたときの説明（title）に使う。
 * 説明だけ変えたいとき（ショートカットを添えるなど）は title を渡す
 */
export function IconButton({
  icon: Icon,
  label,
  title,
  size = 14,
  iconClassName,
  className,
  ...rest
}: ButtonProps & IconProps & { icon: LucideIcon; label: string }) {
  return (
    <button className={cx("icon-button", className)} title={title ?? label} aria-label={label} {...rest}>
      <Icon size={size} className={iconClassName} />
    </button>
  );
}

/** 閉じるボタン */
export function CloseButton({ label = "閉じる", ...rest }: ButtonProps & IconProps & { label?: string }) {
  return <IconButton icon={X} label={label} {...rest} />;
}

/** 取り直すボタン。取得中は回して、押せなくする */
export function RefreshButton({ busy, ...rest }: ButtonProps & IconProps & { label: string; busy: boolean }) {
  return <IconButton icon={RefreshCw} iconClassName={busy ? "spin" : undefined} disabled={busy} aria-busy={busy || undefined} {...rest} />;
}
