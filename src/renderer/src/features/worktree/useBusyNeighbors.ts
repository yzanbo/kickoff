import { useChats } from "@/stores/chats";
import { countBusyAt } from "./workplace";

/**
 * 同じ作業場所（本体・同じワークツリー）で作業中の、ほかのチャットの数（一覧はチャットの店。取れなければ 0）。
 * worktreePath: null = 本体、undefined = まだない作業場所（新しく作るワークツリー。いつも 0）。except: 数えないチャット（いまのチャット）
 */
export function useBusyNeighbors(projectId: number, worktreePath: string | null | undefined, except?: number): number {
  const { chats } = useChats({ projectId });
  return worktreePath === undefined ? 0 : countBusyAt(chats, worktreePath, except);
}
