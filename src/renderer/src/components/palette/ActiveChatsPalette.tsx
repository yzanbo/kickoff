import { Activity } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMN_LABELS, type Run } from "../../../../core/types";
import { api } from "../../api";
import { useRunStates } from "../../approvalsContext";
import { chatTitle } from "../../chatTitle";
import { useServerEvent } from "../../events";
import { useListNavigation } from "../../hooks/useListNavigation";
import { useModalDialog } from "../../hooks/useModalDialog";
import { useProjects } from "../../projectsContext";
import { openRun } from "../../router";
import { COUNTED_COLUMNS } from "../../runState";
import { shortRelativeTime } from "../../time";
import { COLUMN_TONE } from "../board/tones";
import { StatusDot } from "../StatusDot";

type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/**
 * ⌘⇧A: 作業中・回答待ち・確認待ちのチャットを、すべてのプロジェクトから状態ごとに並べる（⌘K と同じ形）。
 * 名前・プロジェクト名で絞り込め、↑↓・Enter で開く。開いている間もチャットの状態の変化に追いつく
 */
export function ActiveChatsPalette({ onClose }: { onClose: () => void }) {
  const { projectName } = useProjects();
  const { stateOf } = useRunStates();
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const dialog = useModalDialog();

  useEffect(() => {
    void api.allRuns().then(setRuns).catch(() => {});
  }, []);
  // 状態が変わったチャットを差し替え、新しいチャットは足す
  useServerEvent((e) => {
    if (e.type !== "run") return;
    setRuns((prev) => (prev.some((r) => r.id === e.run.id) ? prev.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...prev]));
  });

  // 状態ごとのまとまり（アーカイブしたもの・完了は除く。最近動いた順）と、↑↓ で移る平らな並び
  const { groups, items } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byColumn = new Map<CountedColumn, Run[]>(COUNTED_COLUMNS.map((c) => [c, []]));
    for (const run of runs) {
      if (run.archived_at) continue;
      if (q && !`${chatTitle(run.title)} ${projectName(run.project_id)}`.toLowerCase().includes(q)) continue;
      byColumn.get(boardColumnOf(stateOf(run)) as CountedColumn)?.push(run);
    }
    const groups = COUNTED_COLUMNS.map((column) => ({
      column,
      runs: byColumn.get(column)!.sort((a, b) => b.active_at.localeCompare(a.active_at)),
    })).filter((g) => g.runs.length > 0);
    return { groups, items: groups.flatMap((g) => g.runs) };
  }, [runs, query, stateOf, projectName]);

  function go(run: Run | undefined) {
    if (!run) return;
    dialog.close();
    openRun(run.project_id, run.id);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query]);
  // ↑↓ で選んだ行が見えるようにスクロールする
  useEffect(() => {
    dialog.ref.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [nav.index, dialog.ref]);

  return (
    <dialog ref={dialog.ref} className="palette" aria-label="作業中・待ちのチャット" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Activity size={16} className="muted" aria-hidden />
        <input
          autoFocus
          value={query}
          placeholder="作業中・回答待ち・確認待ちのチャットを絞り込む"
          aria-label="作業中・待ちのチャットを絞り込む"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
        />
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">{query.trim() ? "見つかりません" : "作業中・待ちのチャットはありません"}</li>}
        {groups.map((g) => (
          <Fragment key={g.column}>
            <li className="palette-group" role="presentation">
              <StatusDot color={COLUMN_TONE[g.column]} />
              {BOARD_COLUMN_LABELS[g.column]}
              <span className="muted">{g.runs.length}</span>
            </li>
            {g.runs.map((run) => {
              const i = items.indexOf(run);
              return (
                <li key={run.id} role="option" aria-selected={i === nav.index}>
                  <button
                    className={`palette-item ${i === nav.index ? "active" : ""}`}
                    onMouseEnter={() => nav.setIndex(i)}
                    onClick={() => go(run)}
                  >
                    <span className="palette-label">{chatTitle(run.title)}</span>
                    <span className="palette-hint">
                      {projectName(run.project_id)} · {shortRelativeTime(run.active_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </Fragment>
        ))}
      </ul>
    </dialog>
  );
}
