import type { CSSProperties } from "react";
import { BOARD_COLUMN_LABELS } from "../../../../core/types";
import { COLUMN_TONE } from "../board/tones";
import type { StateCounts } from "./sidebarFlags";

const SHOWN = ["running", "needs_input", "review"] as const;

/**
 * プロジェクトの見出しの、状態ごとのチャット数（作業中・回答待ち・確認待ち。色はカンバンの列と同じ。0 のものは出さない）。
 * 1 つのプロジェクトで何本も動かすので、閉じていても「いくつ動いていて、いくつ自分を待っているか」が分かるようにする
 */
export function HeadCounts({ counts }: { counts: StateCounts }) {
  if (SHOWN.every((c) => counts[c] === 0)) return null;
  return (
    <span className="head-counts">
      {SHOWN.map(
        (c) =>
          counts[c] > 0 && (
            <span
              key={c}
              className={`head-count head-count-${c}`}
              style={{ "--tone": COLUMN_TONE[c] } as CSSProperties}
              title={`${BOARD_COLUMN_LABELS[c]} ${counts[c]} 件`}
              aria-label={`${BOARD_COLUMN_LABELS[c]} ${counts[c]} 件`}
            >
              <span className="head-count-dot" aria-hidden />
              {counts[c]}
            </span>
          ),
      )}
    </span>
  );
}
