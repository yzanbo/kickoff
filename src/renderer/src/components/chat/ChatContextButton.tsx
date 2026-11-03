import { MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { useDismiss } from "../../hooks/useDismiss";
import { useListNavigation } from "../../hooks/useListNavigation";
import { useProjects } from "../../projectsContext";
import { relativeTime } from "../../time";
import { IconButton } from "../IconButton";
import { PopoverHeader } from "../PopoverHeader";
import { SearchField } from "../SearchField";

/** 一覧に出すチャットの数（名前で絞り込めば、それより前のものも出る） */
const MAX_ROWS = 50;

/**
 * チャット欄の「チャットを添付」: ほかのチャットを選ぶと、そのやり取りの記録を添付する（AI が読んで、前の話の続きや参考にする）。
 * いまのチャット（exclude）は出さない。同じプロジェクトのものを先に、最近動いた順に並べ、名前で絞り込める（↑↓・Enter で選ぶ）
 */
export function ChatContextButton({ projectId, exclude, onPick }: { projectId?: number; exclude?: number; onPick: (run: Run) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [runs, setRuns] = useState<Run[]>();
  const ref = useRef<HTMLSpanElement>(null);
  const { projectName } = useProjects();
  useDismiss(ref, () => setOpen(false), { enabled: open });
  useEffect(() => {
    // アーカイブしたチャットも出す（前の話を読み込ませたいのは、片付けたチャットのことも多い）
    if (open) void api.allRuns({ archived: true }).then(setRuns, () => setRuns([]));
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (runs ?? [])
      .filter((r) => r.id !== exclude && (!q || chatTitle(r.title).toLowerCase().includes(q)))
      .sort((a, b) => Number(b.project_id === projectId) - Number(a.project_id === projectId) || b.active_at.localeCompare(a.active_at))
      .slice(0, MAX_ROWS);
  }, [runs, query, exclude, projectId]);
  const pick = (run: Run | undefined) => {
    if (!run) return;
    onPick(run);
    setOpen(false);
    setQuery("");
  };
  const nav = useListNavigation(items, pick);

  return (
    <span className="chip-wrap" ref={ref}>
      <IconButton
        icon={MessagesSquare}
        label="チャットを添付"
        title="ほかのチャットのやり取りを添付する（AI が読んで、前の話の続きや参考にします）"
        aria-expanded={open}
        type="button"
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="chip-popover chat-context-popover">
          <PopoverHeader title="添付するチャット" onClose={() => setOpen(false)} />
          <SearchField autoFocus value={query} onChange={setQuery} onKeyDown={nav.onKeyDown} placeholder="チャット名で探す" label="添付するチャットを探す" />
          {!runs ? (
            <p className="muted small">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="muted small">合うチャットはありません</p>
          ) : (
            <ul className="chat-context-list">
              {items.map((r, i) => (
                <li key={r.id}>
                  <button type="button" className={cx("chat-context-row", i === nav.index && "active")} onMouseEnter={() => nav.setIndex(i)} onClick={() => pick(r)}>
                    <span className="chat-context-title">{chatTitle(r.title)}</span>
                    <span className="muted small">
                      {projectName(r.project_id)} · {relativeTime(r.active_at)}
                      {r.archived_at && " · アーカイブ済み"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}
