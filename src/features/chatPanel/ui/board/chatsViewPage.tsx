// chatPanel がプロジェクトの画面の表（projectViews）に出す画面の中身: チャット（とタブの数）
import { NO_CHATS, stateCounts, useChatStates, useChatsWithChildrenByProject } from "@/features/chat/ui";
import { StateCornerCounts, stateCountsSummary } from "@/features/chatList/ui";
import type { ProjectViewBadge, ProjectViewBadgeProps, ProjectViewContext } from "@/features/projects/ui";
import { useBusyBadge } from "@/foundation/ui/hooks/useBusyBadge";
import { ChatsTab } from "./ChatsTab";

export const ChatsViewPage = ({ project, stale, focus }: ProjectViewContext) => <ChatsTab key={project.id} projectId={project.id} focus={stale ? undefined : focus} />;

/**
 * 状態ごとのチャット数（サイドバーのプロジェクトの丸と同じ StateCornerCounts。カンバンの列と同じ数え方で、アーカイブ済みは数えない。子チャットも数える。
 * 縦並びはアイコンの角に重ね、横並びは名前の後ろに並べる）。プロジェクトの画面のデータを読み込んでいる最中は、数の代わりに更新中の印
 */
export function useChatsBadge({ projectId, vertical, loading }: ProjectViewBadgeProps): ProjectViewBadge {
  const { pending } = useChatStates();
  const counts = stateCounts(useChatsWithChildrenByProject()[projectId] ?? NO_CHATS, pending);
  const label = stateCountsSummary(counts);
  return { label: label || null, titled: true, refreshing: useBusyBadge(loading), node: <StateCornerCounts counts={counts} inline={!vertical} /> };
}
