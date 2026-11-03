import { GripVertical, X } from "lucide-react";
import type { DragEvent } from "react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";

/**
 * 「ここまで送ったら止めます」の印（送信待ちの指示とは別の行）。左のつまみでドラッグして、ほかの位置（1 件目の上にも）へ移せる。× で外す
 */
export function QueuedStopLine({
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
}: {
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cx("queued-stop-line", dragging && "dragging")} role="note" onDragOver={onDragOver} onDrop={onDrop}>
      <span
        className="queued-grip queued-stop-grip"
        draggable
        title="ドラッグで止める位置を移す（1 件目の上にも置けます）"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", "ここまで送ったら止めます");
          const line = e.currentTarget.parentElement;
          if (line) {
            const r = line.getBoundingClientRect();
            e.dataTransfer.setDragImage(line, e.clientX - r.left, e.clientY - r.top);
          }
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={13} aria-hidden />
      </span>
      <span>ここまで送ったら止めます</span>
      <IconButton icon={X} size={11} label="この止める線を外す" onClick={onRemove} />
    </div>
  );
}
