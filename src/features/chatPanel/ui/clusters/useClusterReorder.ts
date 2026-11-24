import type { DragEvent } from "react";
import { groupsApi } from "@/features/groups/ui";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { useReorder } from "@/foundation/ui/kit/drag/useReorder";
import { ensureAllRows } from "@/foundation/ui/hooks/useProgressiveRows";
import { moveInList } from "@/foundation/ui/lib/moveInList";
import { GROUP_DRAG_TYPE } from "@/features/chatList/ui";
import type { TabCluster } from "./tabClusters";

/** 並べ替えられるまとまり（自分で作ったグループ。グループなし・作業場所・その他は動かさない） */
const isCustomGroup = (c: TabCluster): c is TabCluster & { projectId: number; group: NonNullable<TabCluster["group"]> } =>
  c.projectId !== undefined && c.group !== undefined;

/**
 * タブのまとまり（自分で作ったグループ）の札をドラッグして、グループの並びを入れ替える（同じプロジェクトの中だけ）。
 * 並びは DB のグループの並び（position）をそのまま変えるので、サイドバー・全プロジェクトのボードのグループの列・ほかのパネルの札もサーバーの知らせで同じ並びになる。
 * 並べ替えの線・薄くする見た目は、サイドバーのグループの並べ替えと同じ（kit/drag の useReorder。上から下へは相手の後ろ・下から上へは前）
 */
export function useClusterReorder(clusters: TabCluster[] | null) {
  const groups = (clusters ?? []).filter(isCustomGroup);
  const ids = groups.map((c) => c.group.id);
  const projectOf = (groupId: number | undefined) => groups.find((c) => c.group.id === groupId)?.projectId;
  const reorder = useReorder({
    keys: ids,
    type: GROUP_DRAG_TYPE,
    axis: "x",
    sideBy: "order",
    onStart: ensureAllRows,
    onMove: (from, to, side) => {
      const next = moveInList(ids, from, to, side) ?? ids;
      // 動いたグループのプロジェクト（並びが変わった最初の位置のグループ。同じプロジェクトの中でしか落とせない）
      const projectId = projectOf(next.find((id, i) => id !== ids[i]));
      if (projectId === undefined) return;
      // ほかのプロジェクトのグループは並べ替えに入れない（そのプロジェクトのグループだけの並びを送る）
      const own = next.filter((id) => projectOf(id) === projectId);
      void groupsApi.reorderGroups(projectId, own).catch(reportFailure("グループを並べ替えられませんでした"));
    },
  });
  return {
    /** 札（TabClusterHead）に付ける、つかむところ（自分で作ったグループだけ） */
    handle: (c: TabCluster) => {
      const handle = isCustomGroup(c) ? reorder.handle(c.group.id) : undefined;
      return handle && { draggable: true, ...handle };
    },
    /** まとまりの枠に付ける、落とす先（同じプロジェクトの自分で作ったグループだけ。タブのドラッグはタブの列に任せる） */
    dropProps: (c: TabCluster) => {
      if (!isCustomGroup(c)) return undefined;
      const same = () => reorder.dragging !== null && projectOf(reorder.dragging) === c.projectId;
      return {
        onDragOver: (e: DragEvent) => {
          if (same()) reorder.over(e, c.group.id);
        },
        onDragLeave: (e: DragEvent) => reorder.leave(e, c.group.id),
        onDrop: (e: DragEvent) => {
          if (same()) reorder.drop(e, c.group.id);
        },
      };
    },
    /** まとまりの枠に付ける属性（動かしている途中は薄く・入る位置の縦の線） */
    attrsFor: (c: TabCluster) => (isCustomGroup(c) ? reorder.attrsFor(c.group.id, "x") : {}),
  };
}
