import type { DragEvent } from "react";
import { api } from "@/api";
import { PROJECT_DRAG_TYPE, useReorder } from "@/features/group/groups";

export type ProjectReorder = ReturnType<typeof useProjectReorder>;

/**
 * サイドバーのプロジェクトのドラッグでの並べ替え（縦並びのカード・横スライドの下の丸で共通）。
 * 並べ替えられるのは、手動の並びのときの、しまっていないプロジェクトだけ（それ以外はつかめず、ドロップ先にもならない）
 */
export function useProjectReorder({ ids, canReorder, isArchived }: { ids: number[]; canReorder: boolean; isArchived: (id: number) => boolean }) {
  const reorder = useReorder(ids, (next) => void api.reorderProjects(next), PROJECT_DRAG_TYPE);
  const draggable = (id: number) => canReorder && !isArchived(id);
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
