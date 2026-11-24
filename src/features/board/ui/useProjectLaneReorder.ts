import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { useReorder } from "@/foundation/ui/kit/drag/useReorder";
import { moveInList } from "@/foundation/ui/lib/moveInList";
import { projectsSettings, projectsApi, useVisibleProjects } from "@/features/projects/ui";
import { PROJECT_DRAG_TYPE, type ChatBucket } from "@/features/chatList/ui";
import type { PlacedDraft } from "@/features/chatPanel/ui";

type Lane = ChatBucket<PlacedDraft>;

/**
 * 全プロジェクトのボードの、プロジェクトの段の見出しのドラッグでの並べ替え（段の並びはサイドバーと同じ並びなので、並べ替えもサイドバーと同じ）。
 * 並び順が「最近動いた順」でも並べ替えられ、落とすと、いま見えている並びのまま動かした順を手動の並びとして保存し、手動の並びに切り替える。
 * enabled でなければ（プロジェクトの段でない・プロジェクトのボード）何も付けない。laneProps は段（ドロップ先・入る位置の線）、headProps は見出し（つかむところ）に付ける
 */
export function useProjectLaneReorder(enabled: boolean) {
  const { active } = useVisibleProjects();
  const [order, setOrder] = useSetting(projectsSettings.listOrder);
  const ids = active.map((p) => p.id);
  const reorder = useReorder({
    keys: ids,
    type: PROJECT_DRAG_TYPE,
    axis: "y",
    sideBy: "order",
    onStart: ensureAllRows,
    onMove: (from, to, side) => {
      void projectsApi.reorderProjects(moveInList(ids, from, to, side) ?? ids);
      if (order !== "manual") setOrder("manual");
    },
  });
  if (!enabled) return {};
  const idOf = (lane: Lane) => (lane.kind === "project" ? lane.projectId : undefined);
  return {
    laneProps: (lane: Lane) => {
      const id = idOf(lane);
      return id === undefined ? {} : { ...reorder.dropProps(id), ...reorder.attrsFor(id) };
    },
    headProps: (lane: Lane) => {
      const id = idOf(lane);
      const handle = id === undefined ? undefined : reorder.handle(id);
      return handle ? { draggable: true, title: "ドラッグでプロジェクトを並べ替える（サイドバーの並びも変わる）", ...handle } : {};
    },
  };
}
