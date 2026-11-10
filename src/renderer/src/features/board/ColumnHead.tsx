import type { ReactNode } from "react";
import { ToneChip } from "@/ui/ToneChip";

/**
 * ボードの列・リストのまとまりの見出し（印・名前・件数を、列の色の札 ToneChip に入れる。action は右端に置くもの）。
 * tone は状態の列の色（COLUMN_TONE・下書きは DRAFT_TONE）で、札の文字・枠・地をその色にする。
 * mark は名前の左の印（状態の列はサイドバーの行と同じ状態の印 `bucketMark`）。なければ色の点
 */
export function ColumnHead({ label, tone, count, mark, action }: { label: string; tone: string; count: number; mark?: ReactNode; action?: ReactNode }) {
  return (
    <header className="column-head">
      <ToneChip tone={tone} dot={!mark} icon={mark} label={label} count={count} />
      {action && <span className="spacer" />}
      {action}
    </header>
  );
}
