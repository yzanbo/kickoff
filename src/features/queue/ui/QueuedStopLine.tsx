import "./QueuedRow.css";
import { GripVertical, OctagonPause, X } from "lucide-react";
import { moveStopOnce, removeStopOnce } from "@shared/chat/queueStops";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragAttrs } from "@/foundation/ui/kit/drag/dragAttrs";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useQueueActions } from "./queueContext";
import { MoveButtons, MoveMenuItems } from "./QueueMoves";

/**
 * 一時停止の印（送信待ちの指示とは別の行）。送信待ちの行と同じ扱いで動かせる:
 * 左のつまみのドラッグ（1 件目の上にも置ける）・右の ↑↓（指示 1 件ぶん上・下へ）・右クリックのメニュー（いちばん上・下へ、外す）・ごみ箱で外す。
 * ボタンは行のボタンと同じ 2 つのまとまり・同じ列にそろえる（並べ替え ↑↓ ｜ 書き直す・送るの位置は空けて、外す）
 */
export function QueuedStopLine({
  at,
  nth,
  here,
}: {
  /** 線の位置（0 = 1 件目の上、n = n 件目のあと） */
  at: number;
  /** 同じ位置に重なった線の何本目か・何本あるか（1 本ずつ動かす・外す。落とす位置の線は重なりのいちばん上の上・いちばん下の下に出す） */
  nth: number;
  here: number;
}) {
  const { c, view, dnd } = useQueueActions();
  const count = view.messages.length;
  const mark = dnd.stopMark(at);
  const dropMark = (mark === "before" && nth === 0) || (mark === "after" && nth === here - 1) ? mark : undefined;
  const onMove = (to: number) => void c.run({ op: "set_stops", stops: moveStopOnce(view.stops, at, to) });
  const onRemove = () => void c.run({ op: "set_stops", stops: removeStopOnce(view.stops, at) });
  const menu = useContextMenu();
  return (
    <>
      <div
        className="queued-stop-line"
        {...dragAttrs(dropMark, { source: dnd.drag?.stop === at && dnd.drag.stopNth === nth })}
        role="note"
        onDragOver={(e) => dnd.overStop(e, at)}
        onDrop={dnd.drop}
        onContextMenu={menu.open}
      >
        <span
          className="queued-grip queued-stop-grip"
          draggable
          title="ドラッグで一時停止の位置を移す（1 件目の上にも置けます）"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", "ここで一時停止");
            startDragGhost(e, { source: e.currentTarget.closest(".queued-stop-line") });
            dnd.startStop(at, nth);
          }}
          onDragEnd={dnd.end}
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
        <MoveButtons at={at} last={count} what="一時停止を " onMove={onMove} />
        <span className="queued-row-actions">
          <span className="queued-stop-space" aria-hidden />
          <span className="queued-stop-space" aria-hidden />
          <IconButton icon={X} label="この一時停止を外す" iconSize={13} onClick={onRemove} />
        </span>
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="一時停止の操作" onClose={menu.close}>
          <MoveMenuItems at={at} last={count} onMove={onMove} />
          {count > 0 && <div className="menu-separator" role="separator" />}
          <MenuItem danger onSelect={onRemove}>
            この一時停止を外す
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
