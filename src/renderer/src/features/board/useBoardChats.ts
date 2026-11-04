import { useEffect, useState } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useServerEvent } from "@/api/events";

/** ボードごとの直前のチャット（プロジェクトを切り替えたときに、すぐ出すため） */
const chatsCache = new Map<string, Chat[]>();

/**
 * カンバンに出すチャット。projectId がなければ（undefined）全プロジェクト、null なら読まない（連動しないパネル）。
 * 一度開いたボードの内容は覚えておき、切り替えた最初の描画から出す（裏で読み直す。ちらつかないように）
 */
export function useBoardChats(projectId: number | undefined | null, showArchived: boolean, onError: (message: string) => void) {
  const cacheKey = `${projectId === null ? "none" : (projectId ?? "all")}${showArchived ? ":archived" : ""}`;
  const fromCache = () => ({ key: cacheKey, chats: chatsCache.get(cacheKey) ?? [], loaded: chatsCache.has(cacheKey) });
  const [state, setState] = useState(fromCache);
  // このボードを開いてから読み直したか（覚えている内容は、開いていない間の移動・作成を知らない。パネルが一覧にないタブを閉じるのは、読み直してから）
  const [freshKey, setFreshKey] = useState<string | null>(null);
  // 切り替えた直後（まだ前のボードの状態のとき）も、覚えている内容を最初の描画から使う
  const current = state.key === cacheKey ? state : fromCache();

  const setChats = (update: Chat[] | ((prev: Chat[]) => Chat[])) =>
    setState((prev) => {
      const base = prev.key === cacheKey ? prev.chats : (chatsCache.get(cacheKey) ?? []);
      const next = typeof update === "function" ? update(base) : update;
      chatsCache.set(cacheKey, next);
      return { key: cacheKey, chats: next, loaded: true };
    });

  useEffect(() => {
    let alive = true;
    setState(fromCache());
    if (projectId === null) return;
    (projectId === undefined ? api.allChats({ archived: showArchived }) : api.chats(projectId, { archived: showArchived }))
      .then((list) => {
        if (!alive) return;
        setChats(list);
        setFreshKey(cacheKey);
      })
      .catch((e: unknown) => alive && onError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, showArchived]);

  useServerEvent((e) => {
    if (projectId === null) return;
    if (e.type === "chat" && (projectId === undefined || e.chat.project_id === projectId)) {
      setChats((prev) => {
        const rest = prev.filter((r) => r.id !== e.chat.id);
        // アーカイブしたチャットは、表示しているときだけ残す
        return e.chat.archived_at && !showArchived ? rest : [e.chat, ...rest];
      });
    } else if (e.type === "chat") {
      // ほかのプロジェクトへ移したチャットは、このボードから外す
      setChats((prev) => (prev.some((r) => r.id === e.chat.id) ? prev.filter((r) => r.id !== e.chat.id) : prev));
    } else if (e.type === "chat_deleted") {
      setChats((prev) => prev.filter((r) => r.id !== e.id));
    }
  });

  return { chats: current.chats, loaded: current.loaded, fresh: freshKey === cacheKey, setChats };
}
