import { Bot, FileCode2, StickyNote, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { memoKindOf } from "@shared/memo/kinds";
import type { MemoSearchHit, SearchHit } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { baseName } from "@/features/memo/memoPaths";
import type { PaletteItem } from "./paletteItem";

/** 打つのが止まってから探すまでの時間 */
const DEBOUNCE_MS = 200;

/** 見つかった所に印を付けた文（⌘K の行の名前） */
function marked(text: string, start: number, end: number) {
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

/** 全文検索の 1 件を、⌘K の行にする（押すとその発言へ移って強調する） */
export function messageItem(hit: SearchHit, projectName: (id: number) => string): PaletteItem {
  return {
    key: `m-${hit.event_id}`,
    label: marked(hit.snippet, hit.match_start, hit.match_end),
    text: hit.snippet,
    hint: `${chatTitle(hit.chat_title)} · ${projectName(hit.project_id)}`,
    icon: hit.type === "user" ? <User size={15} aria-label="自分" /> : <Bot size={15} aria-label="AI" />,
    route: { name: "chat", projectId: hit.project_id, chatId: hit.chat_id, focus: hit.event_id },
  };
}

/** メモの中の文で見つかった 1 行を、⌘K の行にする（押すとそのプロジェクトのメモのタブでメモを開き、その行へ移る） */
export function memoTextItem(hit: MemoSearchHit, projectName: (id: number) => string): PaletteItem {
  return {
    key: `mt-${hit.project_id}-${hit.path}-${hit.line}`,
    label: marked(hit.text, hit.match_start, hit.match_end),
    text: hit.text,
    hint: `${baseName(hit.path)}:${hit.line} · ${projectName(hit.project_id)}`,
    icon: memoKindOf(hit.path) === "html" ? <FileCode2 size={15} aria-label="HTML のメモ" /> : <StickyNote size={15} aria-label="メモ" />,
    route: { name: "project", id: hit.project_id, tab: "memos", memo: hit.path, memoLine: hit.line },
  };
}

/**
 * 中身の文で探す（チャット内の文言・メモ内の文言）: 入力が止まったら search で探す。対象に入れていない・入力が空なら探さない。
 * 古い入力の結果が後から届いても使わない
 */
export function useDebouncedSearch<T>(query: string, enabled: boolean, search: (q: string) => Promise<T[]>) {
  const [hits, setHits] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const latest = useRef(search);
  latest.current = search;
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
      latest
        .current(q)
        .then((r) => alive && setHits(r))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setSearching(false));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return { hits, searching };
}
