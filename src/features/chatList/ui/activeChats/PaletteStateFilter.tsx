import { cx } from "@/foundation/ui/lib/cx";
import { COLUMN_LOOKS, DRAFT_LOOK, type StateTone } from "@shared/chat/stateLooks";
import { StatusDot } from "@/foundation/ui/kit/StatusDot";
import { ACTIVE_STATES, type ActiveState } from "./activeChatGroups";

/** 並べる状態の文と色（下書き・カンバンの列と同じ） */
export const ACTIVE_LOOKS: Record<ActiveState, { label: string; tone: StateTone }> = {
  draft: DRAFT_LOOK,
  running: COLUMN_LOOKS.running,
  needs_input: COLUMN_LOOKS.needs_input,
  unread: COLUMN_LOOKS.unread,
};

/**
 * ⌘⇧A の一覧を状態で絞り込む行: 下書き・作業中・回答待ち・未読を、押すたびに付け外しする（いくつでも選べ、1 つは残す。⌘K の探す対象と同じピル）。
 * それぞれに、ほかの絞り込み（文字・プロジェクト）を通ったものの数を添える。選んだものは覚えておく（palette:active-hidden-states。隠したものだけを覚える）
 */
export function PaletteStateFilter({ shown, counts, onToggle }: { shown: ReadonlySet<ActiveState>; counts: Record<ActiveState, number>; onToggle: (state: ActiveState) => void }) {
  return (
    <div className="palette-filters bar palette-state-filters">
      <div className="palette-projects" role="group" aria-label="状態で絞り込む">
        {ACTIVE_STATES.map((state) => {
          const on = shown.has(state);
          const { label, tone } = ACTIVE_LOOKS[state];
          return (
            <button
              key={state}
              type="button"
              aria-pressed={on}
              className={cx("palette-project pill", on && "active")}
              title={on ? (shown.size > 1 ? `${label}を一覧から外す` : "状態は 1 つ以上選びます") : `${label}も一覧に出す`}
              onClick={() => onToggle(state)}
            >
              <StatusDot state={tone} />
              <span className="palette-project-name">{label}</span>
              <span className="palette-project-count">{counts[state]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
