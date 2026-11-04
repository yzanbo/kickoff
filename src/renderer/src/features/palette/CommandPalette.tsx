import { Bot, FolderGit2, MessageSquare, Plus, Search, User } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SearchHit } from "@shared/types";
import { api } from "@/api";
import { useChats } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { navigate, type Route } from "@/app/router";
import { COMMAND_PALETTE_TARGETS } from "@/lib/storageKeys";

interface Item {
  key: string;
  label: ReactNode;
  /** 絞り込みに使う文 */
  text: string;
  hint: string;
  icon: ReactNode;
  route: Route;
}

/** 探す対象。チャットの中の文言は全文検索（⌘⇧F と同じ API）で、入力したときだけ探す */
type Target = "project" | "chat" | "message";
const TARGETS: { value: Target; label: string }[] = [
  { value: "project", label: "プロジェクト" },
  { value: "chat", label: "チャット" },
  { value: "message", label: "チャット内の文言" },
];
const DEFAULT_TARGETS: Target[] = ["project", "chat"];
const isTarget = (t: string): t is Target => TARGETS.some((x) => x.value === t);

/** 全文検索の 1 件を、⌘K の行にする（押すとその発言へ移って強調する） */
function messageItem(hit: SearchHit, projectName: (id: number) => string): Item {
  return {
    key: `m-${hit.event_id}`,
    label: (
      <>
        {hit.snippet.slice(0, hit.match_start)}
        <mark>{hit.snippet.slice(hit.match_start, hit.match_end)}</mark>
        {hit.snippet.slice(hit.match_end)}
      </>
    ),
    text: hit.snippet,
    hint: `${chatTitle(hit.chat_title)} · ${projectName(hit.project_id)}`,
    icon: hit.type === "user" ? <User size={15} aria-label="自分" /> : <Bot size={15} aria-label="AI" />,
    route: { name: "chat", projectId: hit.project_id, chatId: hit.chat_id, focus: hit.event_id },
  };
}

/** チャットの中の文言: 入力が止まったら全文検索する（対象に入れていないときは探さない） */
function useMessageSearch(query: string, enabled: boolean) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!enabled || !q) {
      setHits([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .search(q, {})
        .then((r) => alive && setHits(r))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setSearching(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return { hits, searching };
}

/** ⌘K: プロジェクトとチャットを名前で（選べばチャットの中の文言でも）探して移動する */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { projects, projectName } = useProjects();
  const [query, setQuery] = useState("");
  // すべてのプロジェクトのチャット（アーカイブしていないもの）
  const { chats } = useChats();
  const dialog = useModalDialog();
  // 探す対象（複数選べる。開き直しても覚えておく。1 つは必ず残す）
  const [stored, setStored] = useSetting(COMMAND_PALETTE_TARGETS);
  const valid = stored.filter(isTarget);
  const targets = valid.length > 0 ? valid : DEFAULT_TARGETS;
  const targetKey = targets.join(",");
  const toggleTarget = (t: Target) => {
    const next = TARGETS.map((x) => x.value).filter((x) => (x === t ? !targets.includes(t) : targets.includes(x)));
    if (next.length > 0) setStored(next);
  };
  const { hits, searching } = useMessageSearch(query, targets.includes("message"));

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const named: Item[] = [];
    if (targets.includes("project")) {
      // 新しいチャットはプロジェクトの操作なので、プロジェクトを探していて何か入力したときだけ
      if (q) {
        for (const p of projects) {
          const label = `${p.name} で新しいチャット`;
          named.push({ key: `new-${p.id}`, label, text: label, hint: "新規", icon: <Plus size={15} />, route: { name: "newChat", projectId: p.id } });
        }
      }
      for (const p of projects) {
        named.push({ key: `p-${p.id}`, label: p.name, text: p.name, hint: "プロジェクト", icon: <FolderGit2 size={15} />, route: { name: "project", id: p.id, tab: "board" } });
      }
    }
    if (targets.includes("chat")) {
      for (const r of chats) {
        const title = chatTitle(r.title);
        named.push({ key: `r-${r.id}`, label: title, text: title, hint: projectName(r.project_id), icon: <MessageSquare size={15} />, route: { name: "chat", projectId: r.project_id, chatId: r.id } });
      }
    }
    const filtered = q ? named.filter((i) => `${i.text} ${i.hint}`.toLowerCase().includes(q)) : named;
    // 名前で見つかったものを先に、続けてチャットの中の文言（それぞれ 50 件まで）
    return [...filtered.slice(0, 50), ...hits.map((h) => messageItem(h, projectName))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, chats, query, hits, targetKey, projectName]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    navigate(item.route);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query, targetKey]);

  const placeholder = `${TARGETS.filter((t) => targets.includes(t.value))
    .map((t) => t.label)
    .join("・")}を検索`;
  return (
    <dialog ref={dialog.ref} className="palette" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Search size={16} className="muted" />
        <input autoFocus value={query} placeholder={placeholder} onChange={(e) => setQuery(e.target.value)} onKeyDown={nav.onKeyDown} />
        {searching && <span className="spinner" aria-label="検索中" />}
      </div>
      {/* 探す対象（複数選べる。押すたびに付け外し。⌘⇧A のプロジェクトの絞り込みと同じピル） */}
      <div className="palette-filters">
        <div className="palette-projects" role="group" aria-label="探す対象">
          {TARGETS.map((t) => {
            const on = targets.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                className={cx("palette-project", on && "active")}
                title={on ? (targets.length > 1 ? `${t.label}を探す対象から外す` : "探す対象は 1 つ以上選びます") : `${t.label}も探す`}
                onClick={() => toggleTarget(t.value)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="palette-list" role="listbox">
        {items.length === 0 && !searching && <li className="palette-empty">見つかりません</li>}
        {items.map((item, i) => (
          <li key={item.key} role="option" aria-selected={i === nav.index}>
            <button className={cx("palette-item", i === nav.index && "active")} onMouseEnter={() => nav.setIndex(i)} onClick={() => go(item)}>
              {item.icon}
              <span className="palette-label">{item.label}</span>
              <span className="palette-hint">{item.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
