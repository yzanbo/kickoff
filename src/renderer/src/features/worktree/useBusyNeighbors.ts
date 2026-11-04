import type { Chat } from "@shared/types";
import { useChats } from "@/stores/chats";

/**
 * 同じ作業場所（本体・同じワークツリー）で作業中の、ほかのチャットの数。
 * 同じフォルダで同時に作業すると、ファイルがぶつかることがあるので知らせるのに使う（一覧はチャットの店。取れなければ 0）
 */
export function useBusyNeighbors(chat: Pick<Chat, "id" | "project_id" | "worktree_path">): number {
  const { chats } = useChats({ projectId: chat.project_id });
  let count = 0;
  for (const other of chats) {
    if (other.id !== chat.id && other.worktree_path === chat.worktree_path && other.status === "running") count++;
  }
  return count;
}
