import { BOARD_COLUMN_LABELS } from "@shared/types";
import { cx } from "@/lib/cx";
import { COUNTED_COLUMNS } from "@/features/chat/chatState";
import { COLUMN_TONE, DRAFT_TONE } from "@/features/chat/tones";
import { StatusDot } from "@/ui/StatusDot";

/** ⌘⇧A で並べる状態（下書き → 作業中・回答待ち・未読。この順に並べる） */
export const ACTIVE_STATES = ["draft", ...COUNTED_COLUMNS] as const;
export type ActiveState = (typeof ACTIVE_STATES)[number];

export const ACTIVE_STATE_LABELS: Record<ActiveState, string> = {
  draft: "下書き",
  running: BOARD_COLUMN_LABELS.running,
  needs_input: BOARD_COLUMN_LABELS.needs_input,
  unread: BOARD_COLUMN_LABELS.unread,
};

const TONES: Record<ActiveState, string> = { draft: DRAFT_TONE, running: COLUMN_TONE.running, needs_input: COLUMN_TONE.needs_input, unread: COLUMN_TONE.unread };

/**
 * ⌘⇧A の一覧を状態で絞り込む行（利用者の依頼）: 下書き・作業中・回答待ち・未読を、押すたびに付け外しする（いくつでも選べ、1 つは残す。⌘K の探す対象と同じピル）。
 * それぞれに、ほかの絞り込み（文字・プロジェクト）を通ったものの数を添える。選んだものは覚えておく（ACTIVE_CHATS_HIDDEN_STATES。隠したものだけを覚える）
 */
export function PaletteStateFilter({ shown, counts, onToggle }: { shown: ReadonlySet<ActiveState>; counts: Record<ActiveState, number>; onToggle: (state: ActiveState) => void }) {
  return (
    <div className="palette-filters palette-state-filters">
      <div className="palette-projects" role="group" aria-label="状態で絞り込む">
        {ACTIVE_STATES.map((state) => {
          const on = shown.has(state);
          const label = ACTIVE_STATE_LABELS[state];
          return (
            <button
              key={state}
              type="button"
              aria-pressed={on}
              className={cx("palette-project", on && "active")}
              title={on ? (shown.size > 1 ? `${label}を一覧から外す` : "状態は 1 つ以上選びます") : `${label}も一覧に出す`}
              onClick={() => onToggle(state)}
            >
              <StatusDot color={TONES[state]} />
              <span className="palette-project-name">{label}</span>
              <span className="palette-project-count">{counts[state]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
