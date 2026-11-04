import { useEffect, useRef } from "react";
import { openRun, type Route } from "./router";
import { useWindowEvent } from "@/hooks/useWindowEvent";

/** 覚えておく、開いたチャットの数 */
const MAX_HISTORY = 50;

/**
 * 開いたチャットの行き来（⌘[ で前に開いたチャット、⌘] で次。ブラウザの戻る・進むと同じ考え方）。
 * コードの編集中（Monaco）の ⌘[ / ⌘] は字下げなので、そちらに任せる
 */
export function useChatHistory(route: Route) {
  const history = useRef<{ list: { projectId: number; runId: number }[]; index: number; moving: boolean }>({ list: [], index: -1, moving: false });
  useEffect(() => {
    if (route.name !== "run") return;
    const h = history.current;
    // ⌘[ / ⌘] で移ったときは、覚えている並びをそのままにする
    if (h.moving) {
      h.moving = false;
      return;
    }
    if (h.list[h.index]?.runId === route.runId) return;
    h.list = [...h.list.slice(0, h.index + 1), { projectId: route.projectId, runId: route.runId }].slice(-MAX_HISTORY);
    h.index = h.list.length - 1;
  }, [route]);

  useWindowEvent("keydown", (e) => {
    if (!e.metaKey || e.altKey || e.ctrlKey || e.shiftKey || (e.key !== "[" && e.key !== "]")) return;
    if ((e.target as HTMLElement | null)?.closest?.(".monaco-editor")) return;
    const h = history.current;
    const step = e.key === "[" ? -1 : 1;
    const next = h.list[h.index + step];
    if (!next) return;
    e.preventDefault();
    h.index += step;
    h.moving = true;
    openRun(next.projectId, next.runId);
  });
}
