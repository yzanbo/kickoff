import type { CSSProperties } from "react";
import { BOARD_COLUMN_LABELS } from "../../../../core/types";
import { COUNTED_COLUMNS, type StateCounts } from "../../runState";
import { COLUMN_TONE } from "../board/tones";

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・確認待ち。0 のものは出さない）。
 * 数え方（stateCounts）・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえる
 */
export function StateStats({ counts }: { counts: StateCounts }) {
  return COUNTED_COLUMNS.filter((c) => counts[c] > 0).map((c) => (
    <span key={c} className="stat stat-state" style={{ "--tone": COLUMN_TONE[c] } as CSSProperties}>
      {BOARD_COLUMN_LABELS[c]} {counts[c]}
    </span>
  ));
}
