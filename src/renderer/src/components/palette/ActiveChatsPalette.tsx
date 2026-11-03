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
import { useProjectTagFilter } from "../../projectTagFilter";
import { TagFilterNotice } from "../TagFilterNotice";
import { openRun } from "../../router";
import { COUNTED_COLUMNS } from "../../runState";
import { shortRelativeTime } from "../../time";
import { COLUMN_TONE, DRAFT_TONE } from "../board/tones";
import { openDraft, useAllDrafts, type SidebarDraft } from "../sidePanel/panelMemory";
import { StatusDot } from "../StatusDot";

type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/** 一覧の 1 行: チャットか、送る前の新しいチャット（下書き） */
type Item = { kind: "run"; key: string; run: Run } | { kind: "draft"; key: string; draft: SidebarDraft };

/** 下書きの名前（書いた文の 1 行目。まだ書いていなければ「新しいチャット」） */
const draftTitle = (draft: SidebarDraft) => draft.text.trim().split("\n")[0] || "新しいチャット";

/**
 * ⌘⇧A: 作業中・回答待ち・未読のチャットを、すべてのプロジェクトから状態ごとに並べる（⌘K と同じ形）。
 * 送る前の新しいチャット（下書き。サイドバー・ボードの「下書き」と同じもの）も、いちばん上に並べる。
 * 名前・プロジェクト名で絞り込め、↑↓・Enter で開く。開いている間もチャットの状態の変化に追いつく
 */
export function ActiveChatsPalette({ onClose }: { onClose: () => void }) {
  const { projectName, projectsById } = useProjects();
  // サイドバーの「タグ」で絞り込んでいれば、合うプロジェクトのチャットだけ
  const tagFilter = useProjectTagFilter();
  const { stateOf } = useRunStates();
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const dialog = useModalDialog();
  const drafts = useAllDrafts();

  useEffect(() => {
    void api.allRuns().then(setRuns).catch(() => {});
  }, []);
  // 状態が変わったチャットを差し替え、新しいチャットは足す
  useServerEvent((e) => {
    if (e.type !== "run") return;
    setRuns((prev) => (prev.some((r) => r.id === e.run.id) ? prev.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...prev]));
  });

  // 状態ごとのまとまり（下書き → 作業中・回答待ち・未読。アーカイブしたもの・既読は除く。最近動いた順）と、↑↓ で移る平らな並び
  const { groups, items } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFilter = (projectId: number) => {
      const project = projectsById.get(projectId);
      return !tagFilter.active || (project !== undefined && tagFilter.matches(project));
    };
    const byColumn = new Map<CountedColumn, Run[]>(COUNTED_COLUMNS.map((c) => [c, []]));
    for (const run of runs) {
      if (run.archived_at || !inFilter(run.project_id)) continue;
      if (q && !`${chatTitle(run.title)} ${projectName(run.project_id)}`.toLowerCase().includes(q)) continue;
      byColumn.get(boardColumnOf(stateOf(run)) as CountedColumn)?.push(run);
    }
    const draftItems: Item[] = drafts
      .filter((d) => inFilter(d.projectId) && (!q || `${draftTitle(d)} ${projectName(d.projectId)}`.toLowerCase().includes(q)))
      .map((draft) => ({ kind: "draft", key: `draft:${draft.memoryKey}:${draft.key}`, draft }));
    const groups = [
      { key: "draft", label: "下書き", tone: DRAFT_TONE, items: draftItems },
      ...COUNTED_COLUMNS.map((column) => ({
        key: column,
        label: BOARD_COLUMN_LABELS[column],
        tone: COLUMN_TONE[column],
        items: byColumn
          .get(column)!
          .sort((a, b) => b.active_at.localeCompare(a.active_at))
          .map((run): Item => ({ kind: "run", key: `run:${run.id}`, run })),
      })),
    ].filter((g) => g.items.length > 0);
    return { groups, items: groups.flatMap((g) => g.items) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches は selected だけで決まる
  }, [runs, drafts, query, stateOf, projectName, projectsById, tagFilter.selected]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    if (item.kind === "draft") openDraft(item.draft);
    else openRun(item.run.project_id, item.run.id);
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
          placeholder="下書き・作業中・回答待ち・未読のチャットを絞り込む"
          aria-label="作業中・待ちのチャットを絞り込む"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
        />
        <TagFilterNotice filter={tagFilter} />
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">{query.trim() ? "見つかりません" : tagFilter.active ? "タグで絞り込んだプロジェクトに、作業中・待ちのチャットはありません" : "作業中・待ちのチャットはありません"}</li>}
        {groups.map((g) => (
          <Fragment key={g.key}>
            <li className="palette-group" role="presentation">
              <StatusDot color={g.tone} />
              {g.label}
              <span className="muted">{g.items.length}</span>
            </li>
            {g.items.map((item) => {
              const i = items.indexOf(item);
              return (
                <li key={item.key} role="option" aria-selected={i === nav.index}>
                  <button
                    className={`palette-item ${i === nav.index ? "active" : ""}`}
                    onMouseEnter={() => nav.setIndex(i)}
                    onClick={() => go(item)}
                  >
                    {item.kind === "draft" ? (
                      <>
                        <span className="palette-label">{draftTitle(item.draft)}</span>
                        <span className="palette-hint">{projectName(item.draft.projectId)} · 未送信</span>
                      </>
                    ) : (
                      <>
                        <span className="palette-label">{chatTitle(item.run.title)}</span>
                        <span className="palette-hint">
                          {projectName(item.run.project_id)} · {shortRelativeTime(item.run.active_at)}
                        </span>
                      </>
                    )}
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
