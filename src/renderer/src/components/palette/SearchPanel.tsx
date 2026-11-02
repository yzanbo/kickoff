import { Bot, Search, User } from "lucide-react";
import { useEffect, useState } from "react";
import type { SearchHit } from "../../../../core/types";
import { api } from "../../api";
import { chatTitle } from "../../chatTitle";
import { useListNavigation } from "../../hooks/useListNavigation";
import { useModalDialog } from "../../hooks/useModalDialog";
import { openRun } from "../../router";
import { relativeTime } from "../../time";
import { Segmented } from "../Segmented";

type SearchScope = "run" | "project" | "all";

interface Props {
  /** 開いた画面のチャット・プロジェクト（範囲の選択肢に使う） */
  runId?: number;
  projectId?: number;
  onClose: () => void;
}

const SCOPE_LABELS: Record<SearchScope, string> = { run: "このチャット", project: "このプロジェクト", all: "すべて" };

/** ⌘⇧F: チャットのやり取りをキーワードで全文検索し、該当する発言へ移動する */
export function SearchPanel({ runId, projectId, onClose }: Props) {
  const scopes: SearchScope[] = [...(runId ? ["run" as const] : []), ...(projectId ? ["project" as const] : []), "all"];
  const [scope, setScope] = useState<SearchScope>(scopes[0]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const dialog = useModalDialog();

  // 入力が止まったら検索する
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(q, scope === "run" ? { runId } : scope === "project" ? { projectId } : {})
        .then((r) => alive && (setHits(r), nav.setIndex(0)))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, scope, runId, projectId]);

  function open(hit: SearchHit | undefined) {
    if (!hit) return;
    dialog.close();
    openRun(hit.project_id, hit.run_id, hit.event_id);
  }
  const nav = useListNavigation(hits, open);

  return (
    <dialog
      ref={dialog.ref}
      className="palette search-panel"
      onClose={onClose}
      {...dialog.backdropProps}
    >
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input
          autoFocus
          value={query}
          placeholder="チャットの中の文言を検索（⌘⇧F）"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
        />
        {loading && <span className="spinner" aria-label="検索中" />}
      </div>
      <div className="search-scopes">
        <Segmented<SearchScope>
          className="search-scope-options"
          label="探す範囲"
          value={scope}
          onChange={setScope}
          options={scopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
        />
        {query.trim() && !loading && <span className="muted small">{hits.length >= 50 ? "50 件以上" : `${hits.length} 件`}</span>}
      </div>
      <ul className="palette-list" role="listbox">
        {query.trim() && !loading && hits.length === 0 && <li className="palette-empty">見つかりません</li>}
        {hits.map((hit, i) => (
          <li key={hit.event_id} role="option" aria-selected={i === nav.index}>
            <button className={`search-hit ${i === nav.index ? "active" : ""}`} onMouseEnter={() => nav.setIndex(i)} onClick={() => open(hit)}>
              <div className="search-hit-head">
                {hit.type === "user" ? <User size={13} aria-label="自分" /> : <Bot size={13} aria-label="AI" />}
                <span className="search-hit-title">{chatTitle(hit.run_title)}</span>
                <span className="muted small">{relativeTime(hit.created_at)}</span>
              </div>
              <div className="search-hit-snippet">
                {hit.snippet.slice(0, hit.match_start)}
                <mark>{hit.snippet.slice(hit.match_start, hit.match_end)}</mark>
                {hit.snippet.slice(hit.match_end)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
