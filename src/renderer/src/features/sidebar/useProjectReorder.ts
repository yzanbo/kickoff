import type { DragEvent } from "react";
import { api } from "@/api";
import { PROJECT_DRAG_TYPE, useReorder } from "@/features/group/groups";

export type ProjectReorder = ReturnType<typeof useProjectReorder>;

/**
 * サイドバーのプロジェクトのドラッグでの並べ替え（縦並びのカード・横スライドとアイコンの列の丸で共通）。
 * 並べ替えられるのは、しまっていないプロジェクト（しまったものはつかめず、ドロップ先にもならない）。
 * 並び順が「最近動いた順」でもつかめ、落とすと、いま見えている並びのまま動かした順を手動の並びとして保存し、onManual で手動に切り替える
 * （前は手動の並びのときだけつかめ、最近動いた順ではドラッグしても何も起きなかった）
 */
export function useProjectReorder({ ids, isArchived, onManual }: { ids: number[]; isArchived: (id: number) => boolean; onManual?: () => void }) {
  const reorder = useReorder(
    ids,
    (next) => {
      void api.reorderProjects(next);
      onManual?.();
    },
    PROJECT_DRAG_TYPE,
  );
  const draggable = (id: number) => !isArchived(id);
  return {
    draggable,
    /** つかむところに付ける（並べ替えられないものは undefined） */
    handle: (id: number) => (draggable(id) ? reorder.handle(id) : undefined),
    /** 動かしている途中・入る位置の線のクラス */
    classFor: (id: number) => (draggable(id) ? reorder.classFor(id) : ""),
    /** 並べ替えのドロップ先にする */
    dropProps: (id: number): Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>> =>
      !draggable(id)
        ? {}
        : {
            onDragOver: (e) => void reorder.over(e, id),
            onDragLeave: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reorder.leave(id);
            },
            onDrop: (e) => void reorder.drop(e, id),
          },
  };
}
