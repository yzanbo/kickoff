import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/** 押せるピル（丸い枠のボタン。styles/types/pill.css の .pill）。色・大きさは className のクラスで --pill-border・--pill-fg・--pill-bg と寸法を入れる */
export function Pill({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("pill", className)} {...rest} />;
}
