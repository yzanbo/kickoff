import { Bot, Search, User } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { SearchHit } from "@shared/types";
import { api } from "@/api";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { ProjectMark } from "@/features/project/ProjectMark";
import { sidebarOrder } from "@/features/project/projectOrder";
import { useProjects } from "@/stores/projects";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { openChat } from "@/app/router";
import { relativeTime } from "@/lib/time";

/** 探す範囲: いまのチャット・すべて・プロジェクト（ID） */
type SearchScope = "chat" | "all" | number;

interface Props {
  /** 開いた画面のチャット・プロジェクト（範囲の選択肢に使う） */
  chatId?: number;
  projectId?: number;
  onClose: () => void;
}

/** チャットのやり取りをキーワードで全文検索し、該当する発言へ移動する（ボードの検索欄の横のボタンから開く） */
export function SearchPanel({ chatId, projectId, onClose }: Props) {
  // 範囲の選択肢: このチャット → いまのプロジェクト（名前で出し、「このプロジェクト」は小さく添える）→ すべて → ほかのプロジェクト（サイドバーの並び。しまったものは出さない）
  const { projects, projectName } = useProjects();
  const others = useMemo(() => sidebarOrder(projects).filter((p) => p.id !== projectId), [projects, projectId]);
  const scopes: SearchScope[] = [...(chatId ? ["chat" as const] : []), ...(projectId ? [projectId] : []), "all", ...others.map((p) => p.id)];
  const [scope, setScope] = useState<SearchScope>(scopes[0]);
  /** 入力欄の Tab / Shift+Tab で範囲を順に切り替える（端では反対の端へ。⌘⇧A のプロジェクトの絞り込みと同じ） */
  const cycleScope = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return false;
    e.preventDefault();
    const i = Math.max(0, scopes.indexOf(scope));
    setScope(scopes[(i + (e.shiftKey ? scopes.length - 1 : 1)) % scopes.length]);
    return true;
  };
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
        .search(q, scope === "chat" ? { chatId } : scope === "all" ? {} : { projectId: scope })
        .then((r) => alive && (setHits(r), nav.setIndex(0)))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, scope, chatId, projectId]);

  function open(hit: SearchHit | undefined) {
    if (!hit) return;
    dialog.close();
    openChat(hit.project_id, hit.chat_id, hit.event_id);
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
          placeholder="チャットの中の文言を検索"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => cycleScope(e) || nav.onKeyDown(e)}
        />
        {loading && <span className="spinner" aria-label="検索中" />}
      </div>
      <div className="search-scopes">
        <div className="palette-projects" role="radiogroup" aria-label="探す範囲（Tab / Shift+Tab で切り替え）">
          {scopes.map((value) => {
            const project = typeof value === "number" ? value : undefined;
            const name = value === "chat" ? "このチャット" : value === "all" ? "すべて" : projectName(value);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                className={cx("palette-project", scope === value && "active")}
                title={project === projectId ? `${name}（このプロジェクト）` : name}
                onClick={() => setScope(value)}
              >
                {project && <ProjectMark project={{ id: project, name }} />}
                <span className="palette-project-name">{name}</span>
                {/* いま開いているプロジェクトには、補足として小さく添える */}
                {project === projectId && project !== undefined && <span className="palette-project-note">このプロジェクト</span>}
              </button>
            );
          })}
        </div>
        {query.trim() && !loading && <span className="muted small">{hits.length >= 50 ? "50 件以上" : `${hits.length} 件`}</span>}
      </div>
      <ul className="palette-list" role="listbox">
        {query.trim() && !loading && hits.length === 0 && <li className="palette-empty">見つかりません</li>}
        {hits.map((hit, i) => (
          <li key={hit.event_id} role="option" aria-selected={i === nav.index}>
            <button className={`search-hit ${i === nav.index ? "active" : ""}`} onMouseEnter={() => nav.setIndex(i)} onClick={() => open(hit)}>
              <div className="search-hit-head">
                {hit.type === "user" ? <User size={13} aria-label="自分" /> : <Bot size={13} aria-label="AI" />}
                <span className="search-hit-title">{chatTitle(hit.chat_title)}</span>
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
