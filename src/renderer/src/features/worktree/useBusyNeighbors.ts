import { useEffect, useState } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { BUSY_STATUSES } from "@/features/chat/chatStatus";
import { useServerEvent } from "@/api/events";
import { useActionError } from "@/hooks/useActionError";

/**
 * 同じ作業場所（本体・同じワークツリー）で作業中の、ほかのチャットの数。
 * 同じフォルダで同時に作業すると、ファイルがぶつかることがあるので知らせるのに使う
 */
export function useBusyNeighbors(chat: Pick<Chat, "id" | "project_id" | "worktree_path">): number {
  const [chats, setChats] = useState<Map<number, Pick<Chat, "id" | "status" | "worktree_path">>>(new Map());
  // 取れなくても知らせを出さないだけなので、失敗は記録するにとどめる
  const { guard } = useActionError();
  useEffect(() => {
    let alive = true;
    void guard(async () => {
      const list = await api.chats(chat.project_id);
      if (alive) setChats(new Map(list.map((r) => [r.id, r])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.project_id]);
  useServerEvent((e) => {
    if (e.type === "chat" && e.chat.project_id === chat.project_id) setChats((prev) => new Map(prev).set(e.chat.id, e.chat));
  });
  let count = 0;
  for (const other of chats.values()) {
    if (other.id !== chat.id && other.worktree_path === chat.worktree_path && BUSY_STATUSES.includes(other.status)) count++;
  }
  return count;
}
