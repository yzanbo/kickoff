import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { flattenBucketChats, type BucketBy } from "@/features/chatList/buckets";
import type { ChatGrouping } from "@/features/chatList/chatGrouping";
import { useChatBuckets } from "@/features/chatList/useChatBuckets";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { useChatLayout, type ChatOrder } from "./chatGroupings";

/** サイドバーの段: まとめ方（グループ・作業場所）の中を、状態順なら状態ごとに分ける（まとめない × 最近動いた順は分けない） */
export const sidebarLevels = (grouping: ChatGrouping, order: ChatOrder): BucketBy[] => [
  ...(grouping === "none" ? [] : [grouping]),
  ...(order === "status" ? (["status"] as const) : []),
];

/**
 * サイドバーのチャットの並び（チャットの ID → 何番目か）。サイドバーと同じまとめ方・並び順・固定・アーカイブ済みで分けて 1 列にする
 * （useWorkspaceRows と同じ分け方。絞り込みは入れない）。project がなければ全プロジェクトで、サイドバーのプロジェクトの並びで分ける。
 * パネルのチャットのタブをサイドバーと同じ順に並べるのに使う（利用者の依頼）
 */
export function useSidebarChatOrder(chats: readonly Chat[], project: number | undefined, enabled: boolean): ReadonlyMap<number, number> {
  const { grouping, order } = useChatLayout();
  const { visible } = useVisibleProjects();
  const levels = sidebarLevels(grouping, order);
  const buckets = useChatBuckets(chats, {
    by: project === undefined ? ["project", ...levels] : levels,
    project,
    projects: project === undefined ? visible : undefined,
    pinned: true,
    archived: grouping === "none" ? "bucket" : "nested",
    idle: !enabled,
  });
  return useMemo(() => new Map(flattenBucketChats(buckets).map((c, i) => [c.id, i])), [buckets]);
}
