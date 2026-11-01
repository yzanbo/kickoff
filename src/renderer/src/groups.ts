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

/** ドロップされたチャットの ID（チャットでなければ undefined） */
export function droppedRunId(e: DragEvent): number | undefined {
  const id = Number(e.dataTransfer.getData(RUN_DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
