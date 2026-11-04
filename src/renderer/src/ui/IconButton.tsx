import { RefreshCw, X, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cx } from "@/lib/cx";
import { tipProps } from "./HoverTip";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & { ref?: Ref<HTMLButtonElement> };

interface IconProps {
  /** アイコンの大きさ（px） */
  size?: number;
  iconClassName?: string;
  /** マウスを乗せたときの説明に添えるショートカットのキー（「⌘B」など。見出しの右に出す） */
  keys?: string;
}

/**
 * アイコンだけのボタン。label は読み上げ（aria-label）と、マウスを乗せたときの説明（アプリ全体の HoverTip。OS の title より早く出る）に使う。
 * 説明だけ変えたいとき（ショートカットを添えるなど）は title を渡す（「名前（説明）」なら見出しと説明に分ける。tipProps）。
 * title 属性は空にして、外側の要素の title が重ねて出ないようにする（説明が 2 つ出ないように）
 */
export function IconButton({
  icon: Icon,
  label,
  title,
  keys,
  size = 14,
  iconClassName,
  className,
  ...rest
}: ButtonProps & IconProps & { icon: LucideIcon; label: string }) {
  return (
    <button className={cx("icon-button", className)} aria-label={label} title="" {...tipProps(title ?? label, keys)} {...rest}>
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
