import { useState, type DragEvent } from "react";

/** チャットをグループへドラッグするときのデータの種類（ほかのドラッグと区別する） */
export const RUN_DRAG_TYPE = "application/x-kickoff-run";

/** チャットのドラッグを始める（ドロップ先でチャットの ID を受け取れるようにする） */
export function startRunDrag(e: DragEvent, runId: number) {
  e.dataTransfer.setData(RUN_DRAG_TYPE, String(runId));
  e.dataTransfer.effectAllowed = "move";
}

/** ドラッグ中のものがチャットか */
export function isRunDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(RUN_DRAG_TYPE);
}

/** グループを並べ替えるドラッグのデータの種類 */
export const GROUP_DRAG_TYPE = "application/x-kickoff-group";

export function startGroupDrag(e: DragEvent, groupId: number) {
  e.dataTransfer.setData(GROUP_DRAG_TYPE, String(groupId));
  e.dataTransfer.effectAllowed = "move";
}

export function isGroupDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(GROUP_DRAG_TYPE);
}

export function droppedGroupId(e: DragEvent): number | undefined {
  const id = Number(e.dataTransfer.getData(GROUP_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * moved を target の位置へ動かした並び。上から下へ動かすときは target の後ろ、
 * 下から上へ動かすときは target の前に入る（どちらも target がいた位置に収まる）
 */
export function reorderIds(ids: number[], moved: number, target: number): number[] {
  const to = ids.indexOf(target);
  if (moved === target || to < 0 || !ids.includes(moved)) return ids;
  const next = ids.filter((id) => id !== moved);
  next.splice(to, 0, moved);
  return next;
}

/** ドロップされたチャットの ID（チャットでなければ undefined） */
export function droppedRunId(e: DragEvent): number | undefined {
  const id = Number(e.dataTransfer.getData(RUN_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * グループのドラッグでの並べ替え（サイドバーとグループのボードで共通）。
 * 動かしているグループを薄くし、入る位置に線を出す（下へ動かすときは相手の後ろ、上へは前）。
 */
export function useGroupReorder(ids: number[], onReorder: (ids: number[]) => void) {
  const [dragging, setDragging] = useState<number>();
  const [target, setTarget] = useState<{ id: number; side: "before" | "after" }>();
  const end = () => {
    setDragging(undefined);
    setTarget(undefined);
  };

  return {
    /** グループの見出し（つかむところ）に付ける */
    handle: (id: number) => ({
      onDragStart: (e: DragEvent) => {
        startGroupDrag(e, id);
        setDragging(id);
      },
      onDragEnd: end,
    }),
    /** dragover。グループのドラッグでなければ false（チャットのドロップなど、ほかの処理に任せる） */
    over: (e: DragEvent, id: number | null): boolean => {
      if (!isGroupDrag(e)) return false;
      const from = dragging === undefined ? -1 : ids.indexOf(dragging);
      const to = id === null ? -1 : ids.indexOf(id);
      if (from < 0 || to < 0 || from === to) {
        setTarget(undefined);
        return true;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const side = from < to ? "after" : "before";
      if (target?.id !== id || target.side !== side) setTarget({ id: id!, side });
      return true;
    },
    /** dragleave（要素の外へ出たとき） */
    leave: (id: number | null) => {
      if (id !== null && target?.id === id) setTarget(undefined);
    },
    /** drop。グループのドロップでなければ false */
    drop: (e: DragEvent, id: number | null): boolean => {
      const moved = droppedGroupId(e);
      if (!moved) return false;
      e.preventDefault();
      end();
      if (id !== null) {
        const next = reorderIds(ids, moved, id);
        if (next !== ids) onReorder(next);
      }
      return true;
    },
    /** グループ（列）に付けるクラス: 動かしている途中 / 入る位置の線 */
    classFor: (id: number) => `${dragging === id ? "group-dragging" : ""} ${target?.id === id ? `drop-${target.side}` : ""}`,
  };
}
