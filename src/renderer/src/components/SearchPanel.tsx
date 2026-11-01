import { Bot, Search, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "../../../core/types";
import { api } from "../api";
import { openRun } from "../router";
import { relativeTime } from "./RunList";
import { SectionBadge } from "./SectionBadge";

export type SearchScope = "run" | "project" | "all";

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
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

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
        .then((r) => alive && (setHits(r), setIndex(0)))
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
    dialogRef.current?.close();
    openRun(hit.project_id, hit.run_id, hit.event_id);
  }

  return (
    <dialog
      ref={dialogRef}
      className="palette search-panel"
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
    >
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input
          autoFocus
          value={query}
          placeholder="チャットの中の文言を検索（⌘⇧F）"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              open(hits[index]);
            }
          }}
        />
        {loading && <span className="spinner" aria-label="検索中" />}
      </div>
      <div className="search-scopes">
        {scopes.map((s) => (
          <button key={s} className={`filter-chip ${scope === s ? "active" : ""}`} onClick={() => setScope(s)}>
            {SCOPE_LABELS[s]}
          </button>
        ))}
        {query.trim() && !loading && <span className="muted small">{hits.length >= 50 ? "50 件以上" : `${hits.length} 件`}</span>}
      </div>
      <ul className="palette-list" role="listbox">
        {query.trim() && !loading && hits.length === 0 && <li className="palette-empty">見つかりません</li>}
        {hits.map((hit, i) => (
          <li key={hit.event_id} role="option" aria-selected={i === index}>
            <button className={`search-hit ${i === index ? "active" : ""}`} onMouseEnter={() => setIndex(i)} onClick={() => open(hit)}>
              <div className="search-hit-head">
                {hit.type === "user" ? <User size={13} aria-label="自分" /> : <Bot size={13} aria-label="AI" />}
                <span className="search-hit-title">{hit.run_title || "チャット"}</span>
                <SectionBadge section={hit.phase} short />
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
