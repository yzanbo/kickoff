import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { projectsSettings } from "@/features/projects/ui";
import { useVisibleProjects } from "@/features/projects/ui/useVisibleProjects";
import { useProjectReorder } from "@/features/sidebar/ui/useProjectReorder";
import type { ChatBucket } from "@/features/chatList/ui/buckets";
import type { PanelDraft } from "@/features/chatPanel/ui/drafts/panelDrafts";

type Lane = ChatBucket<PanelDraft>;

/**
 * 全プロジェクトのボードの、プロジェクトの段の見出しのドラッグでの並べ替え（段の並びはサイドバーと同じ並びなので、並べ替えもサイドバーと同じ）。
 * 並び順が「最近動いた順」でも並べ替えられ、落とすと手動の並びに切り替える（useProjectReorder）。
 * enabled でなければ（プロジェクトの段でない・プロジェクトのボード）何も付けない。laneProps は段（ドロップ先・入る位置の線）、headProps は見出し（つかむところ）に付ける
 */
export function useProjectLaneReorder(enabled: boolean) {
  const { active } = useVisibleProjects();
  const [order, setOrder] = useSetting(projectsSettings.listOrder);
  const reorder = useProjectReorder({
    ids: active.map((p) => p.id),
    isArchived: () => false,
    onManual: order === "manual" ? undefined : () => setOrder("manual"),
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
