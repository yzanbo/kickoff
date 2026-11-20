import type { HTMLAttributes } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/**
 * 色の帯（知らせ・注意の薄い色の地。styles/ui/types/notice.css の .notice）。look は band（欄の上に敷く帯。下に区切りの線）か
 * boxed（色の枠と角の箱）。色・地の濃さは className のクラスで --notice-tone・--notice-tint を入れる
 */
export function Notice({ look, className, ...rest }: { look: "band" | "boxed" } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("notice", className)} data-look={look} {...rest} />;
}
