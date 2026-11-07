import type { CSSProperties, ReactNode } from "react";
import { StatusDot } from "@/ui/StatusDot";

/**
 * ボードの列・リストのまとまりの見出し（色の点・名前・件数を、列の色の札 .column-chip に入れる。action は右端に置くもの）。
 * tone は状態の列の色（COLUMN_TONE・下書きは DRAFT_TONE）で、札の文字・枠・地をその色にする
 */
export function ColumnHead({ label, tone, count, action }: { label: string; tone: string; count: number; action?: ReactNode }) {
  return (
    <header className="column-head">
      <span className="column-chip" style={{ "--head-color": tone } as CSSProperties}>
        <StatusDot color={tone} />
        <span className="column-title">{label}</span>
        <span className="column-count">{count}</span>
      </span>
      {action && <span className="spacer" />}
      {action}
    </header>
  );
}
