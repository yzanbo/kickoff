import type { ChatBucket } from "@/features/chatList/ui/buckets";
import type { PlacedDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";
import { useGroups } from "@/features/groups/ui/stores/groups";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { useGroupDropTargets } from "./useGroupDropTargets";

type Lane = ChatBucket<PlacedDraft>;

/**
 * プロジェクトのボードの段: グループ（列は状態）で、カードを別のグループの段へドラッグして落とすと、そのグループへ移す（「No Group」の段ならグループから外す）。
 * ドロップの決まりはグループの列と同じ useGroupDropTargets（ほかのプロジェクトのチャットは受けない）。
 * enabled でなければ何も付けない。laneProps は BoardLanes の段の要素に付ける（重ねている間は .drop-target）
 */
export function useGroupLaneDrop(projectId: number | undefined, enabled: boolean): { laneProps?: (lane: Lane) => Record<string, unknown> } {
  const groups = useGroups(enabled ? projectId : undefined);
  const { dropProps, dropClass } = useGroupDropTargets(projectId ?? 0, "lanes", {
    groups,
    run: (task, failed) => void task().catch(reportFailure(failed)),
  });
  if (!enabled || projectId === undefined) return {};
  /** 段のグループ（グループの段はそのグループ、「No Group」の段は null。ほかの段は落とし先にしない） */
  const groupOf = (lane: Lane): number | null | undefined => (lane.kind === "group" ? lane.group?.id : lane.kind === "ungrouped" ? null : undefined);
  return {
    laneProps: (lane) => {
      const groupId = groupOf(lane);
      if (groupId === undefined) return {};
      return { ...dropProps(groupId), className: dropClass(groupId) };
    },
  };
}
