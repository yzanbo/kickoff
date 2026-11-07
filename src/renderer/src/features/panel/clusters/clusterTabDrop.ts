import type { Chat } from "@shared/types";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";
import type { BucketHead } from "@/features/chatList/buckets";

/** タブをまとまりに落としたときに変えるもの: チャットのグループ / 送る前の新しいチャット（下書き）の作成先のグループ（groupId が null ならグループなし） */
export type ClusterTabDrop = { kind: "chat"; chatId: number; groupId: number | null } | { kind: "draft"; tabKey: string; groupId: number | null; groupName: string | undefined };

/** チャットを入れられるまとまりのグループ（自分で作ったグループ = その ID / グループなし = null）。ほかのまとまり（固定・アーカイブ済み・作業場所・その他）は undefined */
export function clusterGroupOf(cluster: BucketHead): number | null | undefined {
  if (cluster.projectId === undefined) return undefined;
  if (cluster.kind === "group" && cluster.group) return cluster.group.id;
  if (cluster.kind === "ungrouped") return null;
  return undefined;
}

/**
 * タブ（chat はそのチャット）をまとまりに落としたら、どのグループへ移すか（移さないなら null）。
 * 同じプロジェクトのグループ・グループなしだけで、いまと同じグループ・子チャット（グループに入らない）・チャットの分からないタブ・チャット以外のタブは移さない
 */
export function clusterTabDrop(cluster: BucketHead, tab: PanelTab, chat: Chat | undefined): ClusterTabDrop | null {
  const groupId = clusterGroupOf(cluster);
  if (groupId === undefined) return null;
  if (tab.kind === "new") {
    if (tab.projectId !== cluster.projectId || (tab.group ?? null) === groupId) return null;
    return { kind: "draft", tabKey: tab.key, groupId, groupName: cluster.group?.name };
  }
  if (tab.kind !== "chat" || !chat || chat.parent_chat_id !== null || chat.project_id !== cluster.projectId || chat.group_id === groupId) return null;
  return { kind: "chat", chatId: chat.id, groupId };
}
