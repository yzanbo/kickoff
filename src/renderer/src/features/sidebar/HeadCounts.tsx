import type { CSSProperties } from "react";
import { BOARD_COLUMN_LABELS } from "@shared/types";
import { cx } from "@/lib/cx";
import { COLUMN_TONE } from "@/features/chat/tones";
import { COUNTED_COLUMNS, type CountedColumn, type StateCounts } from "@/features/chat/chatState";

/**
 * プロジェクトの見出しの、状態ごとのチャット数（作業中・回答待ち・未読。色はカンバンの列と同じ。0 のものは出さない）。
 * 1 つのプロジェクトで何本も動かすので、閉じていても「いくつ動いていて、いくつ自分を待っているか」が分かるようにする。
 * 押すと、そのプロジェクトのチャットをその状態だけに絞る（もう一度押すと戻す。絞っている状態は 0 件でも出しておく）
 */
export function HeadCounts({ counts, filter, onFilter }: { counts: StateCounts; filter: CountedColumn | null; onFilter: (state: CountedColumn | null) => void }) {
  const shown = COUNTED_COLUMNS.filter((c) => counts[c] > 0 || c === filter);
  if (shown.length === 0) return null;
  return (
    <span className="head-counts">
      {shown.map((c) => {
        const on = c === filter;
        const label = `${BOARD_COLUMN_LABELS[c]} ${counts[c]} 件`;
        return (
          <button
            key={c}
            type="button"
            className={cx("head-count", `head-count-${c}`, on && "active")}
            style={{ "--tone": COLUMN_TONE[c] } as CSSProperties}
            title={on ? `${label}（押すと、すべてのチャットに戻す）` : `${label}（押すと、${BOARD_COLUMN_LABELS[c]}のチャットだけを出す）`}
            aria-label={label}
            aria-pressed={on}
            onClick={() => onFilter(on ? null : c)}
          >
            <span className="head-count-dot" aria-hidden />
            {counts[c]}
          </button>
        );
      })}
    </span>
  );
}
