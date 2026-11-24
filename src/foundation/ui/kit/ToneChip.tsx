import "./ToneChip.css";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { StatusDot } from "./StatusDot";
import { Tag } from "./Tag";

/**
 * 状態・まとまりの札（色の点・名前・件数を、その色の文字・枠・薄い地の丸い札に入れる。枠の札 Tag の上に、styles/ui/tone-chip.css）。
 * state は色の名前（data-state。色は CSS の [data-state] が決める --state-color。チャットの状態は @shared/chat/stateLooks の tone。なければ灰）、dot で色の点を付ける。グループの色にするなら className に group-hued と
 * style に --hue を渡す。onLabelDoubleClick は名前のダブルクリック（グループの名前を変える）
 */
export function ToneChip({
  state,
  dot = false,
  icon,
  label,
  count,
  className,
  style,
  onLabelDoubleClick,
}: {
  state?: string;
  dot?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  count?: number;
  className?: string;
  style?: CSSProperties;
  onLabelDoubleClick?: () => void;
}) {
  return (
    <Tag look="outline" className={cx("tone-chip", className)} style={style} data-state={state}>
      {dot && state && <StatusDot state={state} />}
      {icon}
      <span className="tone-chip-label" onDoubleClick={onLabelDoubleClick}>
        {label}
      </span>
      {count !== undefined && <span className="tone-chip-count">{count}</span>}
    </Tag>
  );
}
