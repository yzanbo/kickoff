import type { DragEvent } from "react";
import { api } from "@/api";
import { useReorder } from "@/features/group/groups";
import { reportFailure } from "@/ui/dialogs";
import type { TabCluster } from "./tabClusters";

/** 並べ替えられるまとまり（自分で作ったグループ。グループなし・作業場所・その他は動かさない） */
const isCustomGroup = (c: TabCluster): c is TabCluster & { projectId: number; group: NonNullable<TabCluster["group"]> } =>
  c.projectId !== undefined && c.group !== undefined;

/**
 * タブのまとまり（自分で作ったグループ）の札をドラッグして、グループの並びを入れ替える（同じプロジェクトの中だけ）。
 * 並びは DB のグループの並び（position）をそのまま変えるので、サイドバー・全プロジェクトのボードのグループの列・ほかのパネルの札もサーバーの知らせで同じ並びになる。
 * 並べ替えの線・薄くする見た目は、サイドバーのグループの並べ替えと同じ useReorder
 */
export function useClusterReorder(clusters: TabCluster[] | null) {
  const groups = (clusters ?? []).filter(isCustomGroup);
  const ids = groups.map((c) => c.group.id);
  const projectOf = (groupId: number | undefined) => groups.find((c) => c.group.id === groupId)?.projectId;
  const reorder = useReorder(ids, (next) => {
    // 動いたグループのプロジェクト（並びが変わった最初の位置のグループ。同じプロジェクトの中でしか落とせない）
    const projectId = projectOf(next.find((id, i) => id !== ids[i]));
    if (projectId === undefined) return;
    // ほかのプロジェクトのグループは並べ替えに入れない（そのプロジェクトのグループだけの並びを送る）
    const own = next.filter((id) => projectOf(id) === projectId);
    void api.reorderGroups(projectId, own).catch(reportFailure("グループを並べ替えられませんでした"));
  });
  return {
    /** 札（TabClusterHead）に付ける、つかむところ（自分で作ったグループだけ） */
    handle: (c: TabCluster) => (isCustomGroup(c) ? { draggable: true, ...reorder.handle(c.group.id) } : undefined),
    /** まとまりの枠に付ける、落とす先（同じプロジェクトの自分で作ったグループだけ。タブのドラッグはタブの列に任せる） */
    dropProps: (c: TabCluster) => {
      if (!isCustomGroup(c)) return undefined;
      const same = () => projectOf(reorder.dragging) === c.projectId;
      return {
        onDragOver: (e: DragEvent) => {
          if (same()) reorder.over(e, c.group.id);
        },
        onDragLeave: () => reorder.leave(c.group.id),
        onDrop: (e: DragEvent) => {
          if (same()) reorder.drop(e, c.group.id);
        },
      };
    },
    /** まとまりの枠に付けるクラス（動かしている途中は薄く・入る位置の線） */
    classFor: (c: TabCluster) => (isCustomGroup(c) ? reorder.classFor(c.group.id) : ""),
  };
}
