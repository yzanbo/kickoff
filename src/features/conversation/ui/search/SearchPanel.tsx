import "./SearchPanel.css";
import { Bot, Search, User } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { SearchHit } from "@shared/chat/types";
import { chatTitle, chatsApi } from "@/features/chat/ui";
import { sidebarOrder } from "@shared/projects/order";
import { ProjectMark, useProjects } from "@/features/projects/ui";
import { useDebouncedSearch } from "@/foundation/ui/hooks/useDebouncedSearch";
import { PaletteDialog, usePaletteDialog } from "@/foundation/ui/kit/floating/PaletteDialog";
import { Highlight } from "@/foundation/ui/kit/Highlight";
import { PillGroup } from "@/foundation/ui/kit/PillGroup";
import { useRovingList } from "@/foundation/ui/kit/list/useRovingList";
import { cycleValue } from "@/foundation/ui/lib/cycleValue";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { relativeTime } from "@/foundation/ui/lib/time";

/** 探す範囲: いまのチャット・すべて・プロジェクト（ID） */
type SearchScope = "chat" | "all" | number;

interface Props {
  /** 開いた画面のチャット・プロジェクト（範囲の選択肢に使う） */
  chatId?: number;
  projectId?: number;
  onClose: () => void;
}

/** チャットのやり取りをキーワードで全文検索し、該当する発言へ移動する（ボードの検索欄の横のボタン・⌘K の「チャット内の文言」から開く。palette の contentSearch） */
export function SearchPanel({ chatId, projectId, onClose }: Props) {
  // 範囲の選択肢: このチャット → いまのプロジェクト（名前で出し、「このプロジェクト」は小さく添える）→ すべて → ほかのプロジェクト（サイドバーの並び。しまったものは出さない）
  const { projects, projectName } = useProjects();
  const others = sidebarOrder(projects).filter((p) => p.id !== projectId);
  const scopes: SearchScope[] = [...(chatId ? ["chat" as const] : []), ...(projectId ? [projectId] : []), "all", ...others.map((p) => p.id)];
  const [scope, setScope] = useState<SearchScope>(scopes[0]);
  /** 入力欄の Tab / Shift+Tab で範囲を順に切り替える（端では反対の端へ。⌘⇧A のプロジェクトの絞り込みと同じ） */
  const cycleScope = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.metaKey || e.ctrlKey || e.altKey) return false;
    e.preventDefault();
    setScope(cycleValue(scopes, scope, e.shiftKey ? -1 : 1));
    return true;
  };
  const [query, setQuery] = useState("");
  const modal = usePaletteDialog();
  // 入力が止まったら検索する（範囲を変えても探し直す）
  const { results: hits, loading } = useDebouncedSearch(query, (q) => chatsApi.search(q, scope === "chat" ? { chatId } : scope === "all" ? {} : { projectId: scope }), 200, scope);
  const nav = useRovingList({ mode: "activeDescendant", keys: hits, onPick: open });
  useEffect(() => nav.setIndex(0), [hits]);

  function open(hit: SearchHit | undefined) {
    if (!hit) return;
    modal.close();
    openTarget({ kind: "chat", projectId: hit.project_id, chatId: hit.chat_id, focus: hit.event_id });
  }

  return (
    <PaletteDialog
      modal={modal}
      nav={nav}
      className="search-panel"
      icon={<Search size={16} className="muted" />}
      input={{ value: query, onChange: setQuery, placeholder: "チャットの中の文言を検索", onKeyDown: cycleScope }}
      inputAfter={loading && <span className="spinner" aria-label="検索中" />}
      onClose={onClose}
      bars={
        <div className="search-scopes">
          <PillGroup
            className="palette-projects"
            pillClassName="palette-project pill"
            label="探す範囲（Tab / Shift+Tab で切り替え）"
            mode="single"
            selected={[scope]}
            pills={scopes.map((value) => {
              const project = typeof value === "number" ? value : undefined;
              const name = value === "chat" ? "このチャット" : value === "all" ? "すべて" : projectName(value);
              return {
                key: value,
                title: project === projectId ? `${name}（このプロジェクト）` : name,
                label: (
                  <>
                    {project && <ProjectMark project={{ id: project, name }} />}
                    <span className="palette-project-name">{name}</span>
                    {/* いま開いているプロジェクトには、補足として小さく添える */}
                    {project === projectId && project !== undefined && <span className="palette-project-note">このプロジェクト</span>}
                  </>
                ),
              };
            })}
            onChange={([next]) => setScope(next)}
          />
          {query.trim() && !loading && <span className="muted small">{hits.length >= 50 ? "50 件以上" : `${hits.length} 件`}</span>}
        </div>
      }
    >
      {query.trim() && !loading && hits.length === 0 && <li className="palette-empty">見つかりません</li>}
      {hits.map((hit, i) => (
        <li key={hit.event_id} role="option" {...nav.optionProps(i)}>
          <button className={`search-hit ${i === nav.index ? "active" : ""}`} onMouseEnter={() => nav.setIndex(i)} onClick={() => open(hit)}>
            <div className="search-hit-head">
              {hit.type === "user" ? <User size={13} aria-label="自分" /> : <Bot size={13} aria-label="AI" />}
              <span className="search-hit-title">{chatTitle(hit.chat_title)}</span>
              <span className="muted small">{relativeTime(hit.created_at)}</span>
            </div>
            <div className="search-hit-snippet">
              <Highlight text={hit.snippet} marks={[[hit.match_start, hit.match_end]]} />
            </div>
          </button>
        </li>
      ))}
    </PaletteDialog>
  );
}
