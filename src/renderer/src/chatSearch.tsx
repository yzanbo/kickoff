import { useEffect, useState } from "react";
import type { Run, SearchHit } from "../../core/types";
import { api } from "./api";

/**
 * チャットの絞り込み: チャット名と、やり取りの中身（サーバーで全文検索）の両方で探す。
 * contentHits はチャットごとに最初に一致した発言。入力が止まってから検索する。
 */
export function useChatSearch(query: string, projectId?: number) {
  const keyword = query.trim();
  const [contentHits, setContentHits] = useState<Map<number, SearchHit>>(new Map());

  useEffect(() => {
    if (!keyword) {
      setContentHits(new Map());
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .search(keyword, { projectId })
        .then((hits) => {
          if (!alive) return;
          const map = new Map<number, SearchHit>();
          for (const h of hits) if (!map.has(h.run_id)) map.set(h.run_id, h);
          setContentHits(map);
        })
        .catch(() => {});
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [keyword, projectId]);

  const titleMatches = (run: Run) => run.title.toLowerCase().includes(keyword.toLowerCase());
  /** 検索語がなければすべて一致 */
  const matches = (run: Run) => !keyword || titleMatches(run) || contentHits.has(run.id);
  /** 中身だけが一致したときの、一致した発言（名前が一致していれば undefined） */
  const snippetFor = (run: Run) => (keyword && !titleMatches(run) ? contentHits.get(run.id) : undefined);

  return { keyword, matches, snippetFor };
}

/** 検索で一致した部分を強調して表示する */
export function Highlight({ hit }: { hit: SearchHit }) {
  return (
    <>
      {hit.snippet.slice(0, hit.match_start)}
      <mark>{hit.snippet.slice(hit.match_start, hit.match_end)}</mark>
      {hit.snippet.slice(hit.match_end)}
    </>
  );
}
