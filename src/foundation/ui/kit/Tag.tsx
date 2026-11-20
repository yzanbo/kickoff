import type { HTMLAttributes } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/**
 * 札（状態・種類・名前の小さな丸い印。styles/ui/types/tag.css の .tag）。look は outline（色の枠）・ring（内側の線）・solid（白い文字の塗り）、
 * 省けば色の文字と薄い地。色は className のクラスか style で --tag-color を入れる
 */
export function Tag({ look, className, ...rest }: { look?: "outline" | "ring" | "solid" } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("tag", className)} data-look={look} {...rest} />;
}
