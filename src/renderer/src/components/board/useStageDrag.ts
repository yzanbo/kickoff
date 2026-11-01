import { useState, type DragEvent } from "react";
import type { BoardStage, Run } from "../../../../core/types";

/** カンバンのカードを列へドラッグして移す（ドラッグ中のカードと、重ねている列を持つ） */
export function useStageDrag(runs: Run[], onDrop: (run: Run, stage: BoardStage) => void) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<BoardStage | null>(null);
  const end = () => {
    setDragId(null);
    setOver(null);
  };
  return {
    dragId,
    over,
    start: (e: DragEvent, run: Run) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(run.id));
      setDragId(run.id);
    },
    end,
    /** 列（リストのまとまり）をドロップ先にする */
    dropProps: (stage: BoardStage) => ({
      onDragOver: (e: DragEvent) => {
        if (dragId === null) return;
        e.preventDefault();
        if (over !== stage) setOver(stage);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage ? null : o));
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const run = runs.find((r) => r.id === dragId);
        if (run) onDrop(run, stage);
        end();
      },
    }),
  };
}
