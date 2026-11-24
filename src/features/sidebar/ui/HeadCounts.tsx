import "./HeadCounts.css";
import { COLUMN_LOOKS } from "@shared/chat/stateLooks";
import { cx } from "@/foundation/ui/lib/cx";
import { COUNTED_COLUMNS, type CountedColumn, type StateCounts } from "@/features/chat/ui";

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
        const label = `${COLUMN_LOOKS[c].label} ${counts[c]} 件`;
        return (
          <button
            key={c}
            type="button"
            className={cx("head-count tag", `head-count-${c}`, on && "active")}
            data-state={COLUMN_LOOKS[c].tone}
            title={on ? `${label}（押すと、すべてのチャットに戻す）` : `${label}（押すと、${COLUMN_LOOKS[c].label}のチャットだけを出す）`}
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
