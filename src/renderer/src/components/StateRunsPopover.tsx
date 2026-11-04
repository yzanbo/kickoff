import { SquarePen } from "lucide-react";
import type { CSSProperties, Ref } from "react";
import { boardColumnOf, busyWithUnread } from "../../../core/board";
import { BOARD_COLUMN_LABELS, BOARD_COLUMNS, type AgentState, type BoardColumn, type Run } from "../../../core/types";
import { chatTitle } from "../chatTitle";
import { cx } from "../cx";
import { useRunStates } from "../approvalsContext";
import { useProjects } from "../projectsContext";
import { COUNTED_COLUMNS } from "../runState";
import { shortRelativeTime } from "../time";
import { COLUMN_TONE } from "./board/tones";
import { PopoverHeader } from "./PopoverHeader";
import { StatusDot } from "./StatusDot";
import { StatusSlot } from "./StatusSlot";

/** 一覧のまとまり（カンバンの列と、すべての状態を出すときのいちばん下の「アーカイブ済み」） */
type SectionKey = BoardColumn | "archived";

/** 状態ごとのチャットのまとまり（作業中 → 回答待ち → 未読（→ 既読 → アーカイブ済み）の順。中は最近動いた順） */
export interface StateRunsSection {
  column: SectionKey;
  runs: Run[];
}

/** まとまりの名前と色（画面の見出しの状態ごとの数 StateStats でも使う） */
export const SECTION_LABELS: Record<SectionKey, string> = { ...BOARD_COLUMN_LABELS, archived: "アーカイブ済み" };
export const SECTION_TONES: Record<SectionKey, string> = { ...COLUMN_TONE, archived: "var(--extra-muted)" };

/**
 * チャットを状態ごとに分ける（チャットのないまとまりは出さない）。数え方はカンバンの列と同じ（boardColumnOf）で、状態ごとの数（stateCounts）とそろう。
 * 初めは作業中・回答待ち・未読だけ（アーカイブしたものと既読は入れない。画面の見出しの状態ごとの数）。
 * all なら既読と、いちばん下にアーカイブ済みも並べ、渡したチャットをすべて出す（右のパネルのタブのまとまりの札。そのまとまりのチャットの一覧）
 */
export function runsByState(runs: readonly Run[], stateOf: (run: Run) => AgentState, { all = false }: { all?: boolean } = {}): StateRunsSection[] {
  const keys: readonly SectionKey[] = all ? [...BOARD_COLUMNS, "archived"] : COUNTED_COLUMNS;
  const bySection = new Map<SectionKey, Run[]>(keys.map((c) => [c, []]));
  for (const run of runs) {
    const key: SectionKey = run.archived_at ? "archived" : boardColumnOf(stateOf(run));
    bySection.get(key)?.push(run);
  }
  return keys.map((column) => ({ column, runs: bySection.get(column)!.sort((a, b) => b.active_at.localeCompare(a.active_at)) })).filter((s) => s.runs.length > 0);
}

/**
 * 状態ごとにまとめたチャットの一覧（見出しの下に「作業中」「回答待ち」「未読」と、それぞれのチャット）。
 * 画面の見出しの状態ごとの数（StateStats）と、右のパネルのタブのまとまりの名前の札で共通。行を押すと onOpen。
 * 行の左には、サイドバーの行と同じ状態の印（StatusSlot。作業中は回るリング、作業中のまま未読があれば緑の点を重ねる）を出す。
 * showProject なら行にプロジェクト名も出す（いくつかのプロジェクトのチャットが混ざるとき）。
 * newChat を渡すと、いちばん下に新しいチャットを始めるボタンを置く（タブのまとまりの札から開いたとき。そのグループに new チャットを足す）
 */
export function StateRunsPopover({
  title,
  sections,
  showProject = false,
  emptyText = "作業中・回答待ち・未読のチャットはありません",
  newChat,
  onOpen,
  onClose,
  className,
  style,
  popoverRef,
}: {
  title: string;
  sections: StateRunsSection[];
  showProject?: boolean;
  /** チャットがないときの文 */
  emptyText?: string;
  /** いちばん下の新しいチャットのボタン（文と、押したとき。一覧は閉じてから呼ぶ） */
  newChat?: { label: string; onSelect: () => void };
  onOpen: (run: Run) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  popoverRef?: Ref<HTMLDivElement>;
}) {
  const { projectName } = useProjects();
  const { stateOf } = useRunStates();
  return (
    <div ref={popoverRef} className={cx("state-runs-popover", className)} style={style} role="dialog" aria-label={title}>
      <PopoverHeader title={title} onClose={onClose} />
      {sections.length === 0 && <p className="state-runs-empty muted">{emptyText}</p>}
      {sections.map(({ column, runs }) => (
        <section key={column} className="state-runs-section">
          <h3 className="state-runs-head">
            <StatusDot color={SECTION_TONES[column]} />
            {SECTION_LABELS[column]}
            <span className="muted">{runs.length}</span>
          </h3>
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="state-runs-row"
              onClick={() => {
                onClose();
                onOpen(run);
              }}
            >
              {/* サイドバーの行と同じ状態の印（見出しの状態と同じでも、行ごとにひと目で分かるように） */}
              <StatusSlot state={stateOf(run)} unread={busyWithUnread(run, stateOf(run))} />
              <span className="state-runs-title">{chatTitle(run.title)}</span>
              {showProject && <span className="state-runs-project muted">{projectName(run.project_id)}</span>}
              <span className="state-runs-time muted">{shortRelativeTime(run.active_at)}</span>
            </button>
          ))}
        </section>
      ))}
      {newChat && (
        <button
          type="button"
          className="state-runs-new"
          onClick={() => {
            onClose();
            newChat.onSelect();
          }}
        >
          <SquarePen size={14} aria-hidden />
          {newChat.label}
        </button>
      )}
    </div>
  );
}
