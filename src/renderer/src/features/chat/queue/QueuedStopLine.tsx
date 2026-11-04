import { ArrowDown, ArrowUp, GripVertical, OctagonPause, Trash2 } from "lucide-react";
import { useState, type DragEvent, type MouseEvent } from "react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { startQueueDragGhost } from "./queueDragImage";
import { clampToViewport, MenuItem, PopupMenu } from "@/ui/PopupMenu";

/**
 * 一時停止の印（送信待ちの指示とは別の行）。送信待ちの行と同じ扱いで動かせる:
 * 左のつまみのドラッグ（1 件目の上にも置ける）・右の ↑↓（指示 1 件ぶん上・下へ）・右クリックのメニュー（いちばん上・下へ、外す）・ごみ箱で外す。
 * ボタンは行のボタンと同じ 2 つのまとまり・同じ列にそろえる（並べ替え ↑↓ ｜ 書き直す・送るの位置は空けて、外す）
 */
export function QueuedStopLine({
  at,
  count,
  dragging,
  dropMark,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
  onRemove,
}: {
  /** 線の位置（0 = 1 件目の上、n = n 件目のあと） */
  at: number;
  /** 送信待ちの件数（いちばん下の位置） */
  count: number;
  dragging: boolean;
  /** 指示をこの線のすぐ上・下に落とすときの、落とす位置の線 */
  dropMark?: "before" | "after";
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  /** 線を位置 to へ動かす */
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  return (
    <>
      <div
        className={cx("queued-stop-line", dragging && "dragging", dropMark && `drop-${dropMark}`)}
        role="note"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={(e: MouseEvent) => {
          e.preventDefault();
          setMenu(clampToViewport(e.clientX, e.clientY, 260, 200));
        }}
      >
        <span
          className="queued-grip queued-stop-grip"
          draggable
          title="ドラッグで一時停止の位置を移す（1 件目の上にも置けます）"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "ここで一時停止");
            startQueueDragGhost(e);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={13} aria-hidden />
        </span>
        <span className="queued-stop-label">
          {/* 見出しの「n 件目のあとで一時停止」と同じアイコン */}
          <OctagonPause size={12} aria-hidden />
          ここで一時停止
        </span>
        <span className="queued-stop-rule" aria-hidden />
        {/* 行と同じ 2 つのまとまり・同じ列に置く: 並べ替え（↑↓）｜ 操作（書き直す・送るの位置は空けて、外すを消すの列に） */}
        <span className="queued-row-moves">
          <IconButton icon={ArrowUp} label="一時停止を 1 つ上へ移動" size={13} disabled={at === 0} onClick={() => onMove(at - 1)} />
          <IconButton icon={ArrowDown} label="一時停止を 1 つ下へ移動" size={13} disabled={at >= count} onClick={() => onMove(at + 1)} />
        </span>
        <span className="queued-row-actions">
          <span className="queued-stop-space" aria-hidden />
          <span className="queued-stop-space" aria-hidden />
          <IconButton icon={Trash2} label="この一時停止を外す" size={13} onClick={onRemove} />
        </span>
      </div>
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} label="一時停止の操作" onClose={() => setMenu(undefined)}>
          {at > 0 && <MenuItem onSelect={() => onMove(0)}>いちばん上へ移動</MenuItem>}
          {at > 0 && <MenuItem onSelect={() => onMove(at - 1)}>1 つ上へ移動</MenuItem>}
          {at < count && <MenuItem onSelect={() => onMove(at + 1)}>1 つ下へ移動</MenuItem>}
          {at < count && <MenuItem onSelect={() => onMove(count)}>いちばん下へ移動</MenuItem>}
          {count > 0 && <div className="menu-separator" role="separator" />}
          <MenuItem danger onSelect={onRemove}>
            この一時停止を外す
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
