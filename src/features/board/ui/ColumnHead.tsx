import type { ReactNode } from "react";
import type { StateTone } from "@shared/chat/stateLooks";
import { ToneChip } from "@/foundation/ui/kit/ToneChip";

/**
 * ボードの列・リストのまとまりの見出し（印・名前・件数を、列の色の札 ToneChip に入れる。action は右端に置くもの）。
 * tone は状態の列の色の名前（COLUMN_LOOKS の tone・下書きは DRAFT_LOOK）で、札の文字・枠・地をその色にする。
 * mark は名前の左の印（状態の列はサイドバーの行と同じ状態の印 `bucketMark`）。なければ色の点
 */
export function ColumnHead({ label, tone, count, mark, action }: { label: string; tone: StateTone; count: number; mark?: ReactNode; action?: ReactNode }) {
  return (
    <header className="column-head">
      <ToneChip state={tone} dot={!mark} icon={mark} label={label} count={count} />
      {action && <span className="spacer" />}
      {action}
    </header>
  );
}
