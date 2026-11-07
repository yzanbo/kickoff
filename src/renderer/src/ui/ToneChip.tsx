import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { StatusDot } from "./StatusDot";

/**
 * 状態・まとまりの札（色の点・名前・件数を、その色の文字・枠・薄い地の丸い札に入れる。styles/ui/tone-chip.css）。
 * ボードの列の見出しで作った見た目を、画面の見出しの状態ごとの数・状態ごとのチャットの一覧・⌘⇧A の一覧の見出しでも使う。
 * tone はその色（COLUMN_TONE・STATE_TONE・bucketTone など。なければ灰）、dot で色の点を付ける。グループの色にするなら className に group-hued と
 * style に --group-hue を渡す。onLabelDoubleClick は名前のダブルクリック（グループの名前を変える）
 */
export function ToneChip({
  tone,
  dot = false,
  icon,
  label,
  count,
  className,
  style,
  onLabelDoubleClick,
}: {
  tone?: string;
  dot?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  count?: number;
  className?: string;
  style?: CSSProperties;
  onLabelDoubleClick?: () => void;
}) {
  return (
    <span className={cx("tone-chip", className)} style={tone ? ({ "--head-color": tone, ...style } as CSSProperties) : style}>
      {dot && tone && <StatusDot color={tone} />}
      {icon}
      <span className="tone-chip-label" onDoubleClick={onLabelDoubleClick}>
        {label}
      </span>
      {count !== undefined && <span className="tone-chip-count">{count}</span>}
    </span>
  );
}
