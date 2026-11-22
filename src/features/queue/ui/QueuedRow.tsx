import { GripVertical, Pencil, SendHorizontal, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { QUEUE_ACTION_LABELS, type QueuedMessage } from "@shared/chat/types";
import { queueActionOf } from "@shared/chat/queueActions";
import { relayOf } from "@shared/chat/prompts";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { startDragGhost } from "@/foundation/ui/kit/dragGhost";
import { dragAttrs } from "@/foundation/ui/kit/drag/dragAttrs";
import { QUEUE_ACTION_LOOKS } from "@/features/compact/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { AttachmentPeek } from "@/features/attachments/ui/AttachmentPeek";
import { HandBackFromChip } from "@/features/childChats/ui";
import { useQueueActions } from "./queueContext";
import { askHandlersOf, groupActionsOf, rowActionsOf } from "./queueOps";
import { MoveButtons } from "./QueueMoves";
import { QueuedRowMenu } from "./QueuedRowMenu";

/**
 * 送信待ちの 1 行: つまみ（ドラッグで並べ替え。2 件以上のとき）・番号・添付・文・操作のボタン。
 * 文は選んでコピーでき、ダブルクリックで書き直す。右クリックでも同じ操作（QueuedRowMenu）。
 * ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選び、選んでいる行の右クリックは選んだもの全体への操作になる。
 * 挟む行（会話の圧縮 message.compact・コンテキストの消去 message.clear）は「会話を圧縮」「コンテキストを消去」と出し、
 * 書き直す・新しいチャット / 子チャットで聞くを出さない（送ると圧縮・消去する）
 */
export function QueuedRow({
  message: m,
  index: i,
  count,
  busy,
  selected,
  stopBefore,
  stopAfter,
}: {
  message: QueuedMessage;
  index: number;
  count: number;
  busy: boolean;
  selected: boolean;
  /** この指示のすぐ前・すぐあとに一時停止があるか */
  stopBefore: boolean;
  stopAfter: boolean;
}) {
  const q = useQueueActions();
  const { dnd, selection } = q;
  // 右クリックのメニュー（行は画面の下のほう（チャット欄のすぐ上）にあるので、下に入らなければ上へ寄せる。PopupMenu が大きさを測って収める）
  const menu = useContextMenu();
  const actions = rowActionsOf(q, m, i, stopBefore, stopAfter);
  // 選んでいれば選んでいる数（2 件以上ならメニューは選んだもの全体へ）。つまみからドラッグすると、選んだものをまとめて動かす
  const selectedCount = selected ? selection.selected.length : 0;
  const action = queueActionOf(m);
  const look = action && QUEUE_ACTION_LOOKS[action];
  const relay = relayOf(m.text);
  // 作業中は止めずに、いまのやり取りに伝える（作業していなければ、すぐ送る）。挟む行は、作業中ならいちばん上へ移して、いまのやり取りが終わったらすぐ圧縮・消去する
  const sendLabel = look ? (busy ? look.sendBusy : look.sendIdle) : busy ? "いま送る（作業は止めない）" : "いますぐ送る";
  return (
    <>
      <div
        className={cx("queued-row", selected && "selected")}
        // 入る位置の線（動かしても変わらないところには出さない）
        {...dragAttrs(dnd.rowMark(i), { source: dnd.drag?.id === m.id || dnd.drag?.ids?.includes(m.id) })}
        onDragOver={(e) => dnd.overRow(e, i)}
        onDrop={dnd.drop}
        // Shift ＋クリックで範囲を選ぶときに、文の選択が伸びないようにする
        onMouseDown={(e) => void (e.shiftKey && !(e.target as HTMLElement).closest("button") && e.preventDefault())}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          // 文をなぞって選んだあとのクリックは、選ぶ操作にしない
          if (!e.shiftKey && !e.metaKey && !e.ctrlKey && window.getSelection()?.toString()) return;
          selection.selectRow(e, m.id);
        }}
        onDoubleClick={(e) => {
          // ボタン・サムネイルのダブルクリックは除く
          if (action || (e.target as HTMLElement).closest("button")) return;
          actions.edit();
        }}
        // 文を選んでいるときは、コピーのための既定のメニューに任せる
        onContextMenu={(e: MouseEvent) => void (!window.getSelection()?.toString() && menu.open(e))}
      >
        {/* ドラッグはつまみからだけ（文は選んでコピーできるように、行全体はドラッグにしない） */}
        {count > 1 && (
          <span
            className="queued-grip"
            draggable
            title="ドラッグで並べ替え"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", m.text);
              // 動かしている間は、この行の半透明の写しがカーソルに付いて動く（まとめて動かすときは「n 件」を添える）
              startDragGhost(e, { source: e.currentTarget.closest(".queued-row"), count: selected ? Math.max(1, selectedCount) : 1 });
              dnd.startMessage(m.id, selected && selectedCount > 1 ? selection.selected : undefined);
            }}
            onDragEnd={dnd.end}
          >
            <GripVertical size={13} aria-hidden />
          </span>
        )}
        {/* 送る順番（1 が次に送るもの） */}
        <span className="queued-index" aria-label={`${i + 1} 番目`}>{i + 1}</span>
        {action && look ? (
          <span className={cx("queued-text queued-action", look.tone)} title={look.rowTitle}>
            <look.icon size={13} aria-hidden />
            {QUEUE_ACTION_LABELS[action]}
          </span>
        ) : (
          <>
            <AttachmentPeek attachments={m.attachments} />
            {/* 子チャットから渡した依頼（「親チャットに追加」の送信待ち）の出どころ */}
            {m.handoff_from && <HandBackFromChip from={m.handoff_from} />}
            {/* サブエージェントに「あとで」伝える指示は、AI への前置きを隠して宛先の札と本文だけ */}
            {relay && <span className="queued-relay-tag tag">伝える → {relay.name}</span>}
            <span className="queued-text" title={relay ? relay.text : m.text}>{(relay ? relay.text : m.text) || m.attachments.map((a) => a.name).join("、")}</span>
          </>
        )}
        {/* 右の操作は 2 つのまとまり: 並べ替え（↑↓。狭い欄では隠し、つまみ・右クリックに任せる）｜ この指示への操作（書き直す・送る・消す） */}
        <MoveButtons at={i} last={count - 1} onMove={actions.move} />
        <span className="queued-row-actions">
          {action ? (
            // 書き直すボタンの場所は空けておく（ほかの行と送る・消すの位置をそろえる）
            <span className="queued-stop-space" aria-hidden />
          ) : (
            <IconButton icon={Pencil} label="文を書き直す" title="文を書き直す（ダブルクリックでも）" iconSize={13} onClick={actions.edit} />
          )}
          <IconButton icon={SendHorizontal} label={sendLabel} iconSize={13} onClick={actions.sendNow} />
          <IconButton icon={Trash2} label="送信待ちから消す" iconSize={13} onClick={actions.remove} />
        </span>
      </div>
      {/* メニューは行の外に置く（行のダブルクリック・右クリックがメニューの中に効かないように） */}
      {menu.menu && (
        <QueuedRowMenu
          at={menu.menu.at}
          onClose={menu.close}
          index={i}
          count={count}
          action={action}
          sendLabel={sendLabel}
          selectedCount={selectedCount}
          stopBefore={stopBefore}
          stopAfter={stopAfter}
          actions={actions}
          groupActions={groupActionsOf(q)}
          ask={askHandlersOf(q, m.id)}
        />
      )}
    </>
  );
}
