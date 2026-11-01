import type { DragEvent } from "react";

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
