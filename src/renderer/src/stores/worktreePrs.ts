// ワークツリーの PR の知らせ（ワークツリーのブランチの PR が GitHub でマージされた・マージせずに閉じられた）。
// 見張りはコア（5 分ごと）で、アプリを開いたときに 1 回読み、変わったらサーバーの知らせ（プロジェクトの分を丸ごと）で入れ替える
import { useMemo } from "react";
import type { BusEvent, WorktreePrNotice } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { useStore } from "./useStore";

const NONE: WorktreePrNotice[] = Object.freeze([]) as unknown as WorktreePrNotice[];

/** 知らせで一覧を直す（そのプロジェクトの分を入れ替える・消したプロジェクトの分を外す。関係なければ同じ一覧） */
export function reduceWorktreePrs(list: WorktreePrNotice[], event: BusEvent): WorktreePrNotice[] {
  if (event.type === "project_deleted") return list.some((n) => n.project_id === event.id) ? list.filter((n) => n.project_id !== event.id) : list;
  if (event.type !== "worktree_prs") return list;
  return [...list.filter((n) => n.project_id !== event.project_id), ...event.notices];
}

export const worktreePrsStore = createStore<WorktreePrNotice[]>({ load: () => api.worktreePrs(), reduce: reduceWorktreePrs });

/** いまの知らせ（すべてのプロジェクト。届くまでは空） */
export const useWorktreePrNotices = (): WorktreePrNotice[] => useStore(worktreePrsStore).data ?? NONE;

/** 作業場所（ワークツリーのフォルダ）ごとの知らせを引く関数（知らせがなければ undefined） */
export function useWorktreePrLookup(): (worktree: string | null | undefined) => WorktreePrNotice | undefined {
  const notices = useWorktreePrNotices();
  return useMemo(() => {
    const byPath = new Map(notices.map((n) => [n.worktree, n]));
    return (worktree) => (worktree ? byPath.get(worktree) : undefined);
  }, [notices]);
}
