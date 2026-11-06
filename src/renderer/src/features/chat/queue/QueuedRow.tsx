import { ArrowDown, ArrowUp, GripVertical, Pencil, SendHorizontal, Shrink, Trash2 } from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import type { QueuedMessage } from "@shared/types";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { startQueueDragGhost } from "./queueDragImage";
import { COMPACT_ROW_TEXT } from "./queuedHint";
import { AttachmentPeek } from "@/features/chat/attachments/AttachmentPeek";

/** 送信待ちの 1 行への操作（行のボタンと右クリックのメニューで共通） */
export interface QueuedRowActions {
  edit: () => void;
  /** この指示のすぐあとの一時停止を付ける・外す */
  toggleStop: () => void;
  /** この指示のすぐ前の一時停止を付ける・外す */
  toggleStopBefore: () => void;
  /** この指示のすぐあとに会話の圧縮の行を足す */
  compactAfter: () => void;
  move: (to: number) => void;
  sendNow: () => void;
  remove: () => void;
}

/**
 * 送信待ちの 1 行: つまみ（ドラッグで並べ替え。2 件以上のとき）・番号・添付・文・操作のボタン。
 * 文は選んでコピーでき、ダブルクリックで書き直す。右クリックでも同じ操作（狭いときに隠す ↑↓ もここに残す）。
 * ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選び、選んでいる行の右クリックは選んだもの全体への操作になる。
 * 会話の圧縮の行（message.compact）は「会話を圧縮」と出し、書き直す・新しいチャットで聞くを出さない（送ると圧縮する）
 */
export function QueuedRow({
  message: m,
  index: i,
  count,
  busy,
  selectedCount,
  dragCount = 1,
  isStop,
  isStopBefore,
  onAsk,
  onSelect,
  groupActions,
  className,
  actions,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  message: QueuedMessage;
  index: number;
  count: number;
  busy: boolean;
  /** 選ばれていれば、選んでいる数（0 なら選ばれていない）。2 件以上なら、右クリックのメニューは選んだもの全体への操作にする */
  selectedCount: number;
  /** この行のつまみからドラッグしたときに動く数（選んだ行をつかむと、選んだものをまとめて動かす） */
  dragCount?: number;
  /** この指示のすぐあとに一時停止があるか */
  isStop: boolean;
  /** この指示のすぐ前に一時停止があるか */
  isStopBefore: boolean;
  /** 新しいチャットで聞く（文と添付を新しいチャットのタブに入れて開く。remove なら送信待ちから外す = 移す。選んでいれば選んだものすべて） */
  onAsk?: (remove: boolean) => void;
  /** 行のクリック（⌘ / Ctrl で 1 件ずつ、Shift で範囲を選ぶ） */
  onSelect: (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void;
  /** 選んだもの全体への操作（右クリックのメニュー） */
  groupActions: { edit: () => void; sendTogether: () => void; merge: () => void; moveTo: (to: "top" | "bottom") => void; remove: () => void };
  className: string;
  actions: QueuedRowActions;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  // 右クリックのメニュー（行は画面の下のほう（チャット欄のすぐ上）にあるので、下に入らなければ上へ寄せる。PopupMenu が大きさを測って収める）
  const menu = useContextMenu();
  const compact = Boolean(m.compact);
  // 作業中は止めずに、いまのやり取りに伝える（作業していなければ、すぐ送る）。圧縮の行は、作業中ならいちばん上へ移して、いまのやり取りが終わったらすぐ圧縮する
  const sendLabel = compact ? (busy ? "このやり取りのあとですぐ圧縮" : "いますぐ圧縮") : busy ? "いま送る（作業は止めない）" : "いますぐ送る";
  return (
    <>
    <div
      className={className}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // Shift ＋クリックで範囲を選ぶときに、文の選択が伸びないようにする
      onMouseDown={(e) => {
        if (e.shiftKey && !(e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        // 文をなぞって選んだあとのクリックは、選ぶ操作にしない
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey && window.getSelection()?.toString()) return;
        onSelect(e);
      }}
      onDoubleClick={(e) => {
        // ボタン・サムネイルのダブルクリックは除く
        if (compact || (e.target as HTMLElement).closest("button")) return;
        actions.edit();
      }}
      onContextMenu={(e: MouseEvent) => {
        // 文を選んでいるときは、コピーのための既定のメニューに任せる
        if (window.getSelection()?.toString()) return;
        menu.open(e);
      }}
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
            startQueueDragGhost(e, dragCount);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={13} aria-hidden />
        </span>
      )}
      {/* 送る順番（1 が次に送るもの） */}
      <span className="queued-index" aria-label={`${i + 1} 番目`}>
        {i + 1}
      </span>
      {compact ? (
        <span className="queued-text queued-compact" title="ここまで送ったら、これまでの会話を要約してコンテキストを空けます（Claude Code の /compact）">
          <Shrink size={13} aria-hidden />
          {COMPACT_ROW_TEXT}
        </span>
      ) : (
        <>
          <AttachmentPeek attachments={m.attachments} />
          <span className="queued-text" title={m.text}>
            {m.text || m.attachments.map((a) => a.name).join("、")}
          </span>
        </>
      )}
      {/* 右の操作は 2 つのまとまり: 並べ替え（↑↓。狭い欄では隠し、つまみ・右クリックに任せる）｜ この指示への操作（書き直す・送る・消す） */}
      <span className="queued-row-moves">
        <IconButton icon={ArrowUp} label="1 つ上へ移動" size={13} disabled={i === 0} onClick={() => actions.move(i - 1)} />
        <IconButton icon={ArrowDown} label="1 つ下へ移動" size={13} disabled={i === count - 1} onClick={() => actions.move(i + 1)} />
      </span>
      <span className="queued-row-actions">
        {compact ? (
          // 書き直すボタンの場所は空けておく（ほかの行と送る・消すの位置をそろえる）
          <span className="queued-stop-space" aria-hidden />
        ) : (
          <IconButton icon={Pencil} label="文を書き直す" title="文を書き直す（ダブルクリックでも）" size={13} onClick={actions.edit} />
        )}
        <IconButton icon={SendHorizontal} label={sendLabel} size={13} onClick={actions.sendNow} />
        <IconButton icon={Trash2} label="送信待ちから消す" size={13} onClick={actions.remove} />
      </span>
    </div>
      {/* メニューは行の外に置く（行のダブルクリック・右クリックがメニューの中に効かないように） */}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="送信待ちの指示の操作" onClose={menu.close}>
          {selectedCount > 1 ? (
            // 選んだもの全体への操作（書き直す → 送る → 並べ替え → 新しいチャットへ → 消す）
            <>
              <MenuItem onSelect={groupActions.edit} title="選んだ指示の書き直す欄をまとめて開きます（1 件ずつ保存・やめるができます）">
                選んだ {selectedCount} 件を書き直す
              </MenuItem>
              <div className="menu-separator" role="separator" />
              <MenuItem onSelect={groupActions.sendTogether}>選んだ {selectedCount} 件をまとめて送る</MenuItem>
              <MenuItem onSelect={groupActions.merge} title="送らずに 1 つの指示にまとめます（列の順に空行でつなぎ、添付も合わせます）">
                選んだ {selectedCount} 件を 1 つにまとめる
              </MenuItem>
              <div className="menu-separator" role="separator" />
              <MenuItem onSelect={() => groupActions.moveTo("top")}>選んだ {selectedCount} 件をいちばん上へ移動</MenuItem>
              <MenuItem onSelect={() => groupActions.moveTo("bottom")}>選んだ {selectedCount} 件をいちばん下へ移動</MenuItem>
              {onAsk && <AskMenuItems onAsk={onAsk} what={`選んだ ${selectedCount} 件`} />}
              <div className="menu-separator" role="separator" />
              <MenuItem danger onSelect={groupActions.remove}>
                選んだ {selectedCount} 件を送信待ちから消す
              </MenuItem>
            </>
          ) : (
            // 1 件への操作（書き直す → 送る → 止める（前・あと）→ 並べ替え → 新しいチャットへ → 消す）
            <>
              {!compact && <MenuItem onSelect={actions.edit}>文を書き直す</MenuItem>}
              {!compact && <div className="menu-separator" role="separator" />}
              <MenuItem onSelect={actions.sendNow}>{sendLabel}</MenuItem>
              <div className="menu-separator" role="separator" />
              <MenuItem
                onSelect={actions.toggleStopBefore}
                title={
                  isStopBefore
                    ? "この指示の前の一時停止を外します"
                    : "この指示の前に一時停止を挟みます。手前まで自動で送ったら、この指示から先は送らずに止めておきます（線はドラッグで動かせます）"
                }
              >
                {isStopBefore ? "この指示の前の一時停止を外す" : "この指示の前に一時停止を挟む"}
              </MenuItem>
              <MenuItem
                onSelect={actions.toggleStop}
                title={isStop ? "この指示のあとの一時停止を外します" : "この指示のあとに一時停止を挟みます。この指示まで自動で送ったら、残りは送らずに止めておきます（線はドラッグで動かせます）"}
              >
                {isStop ? "この指示のあとの一時停止を外す" : "この指示のあとに一時停止を挟む"}
              </MenuItem>
              {!compact && (
                <MenuItem
                  onSelect={actions.compactAfter}
                  title="この指示のすぐあとに「会話を圧縮」を挟みます。この指示の作業が終わったら、次を送る前に会話を要約してコンテキストを空けます（すぐあとに一時停止があれば、止まる前に圧縮します）"
                >
                  このあとで会話を圧縮
                </MenuItem>
              )}
              {count > 1 && <div className="menu-separator" role="separator" />}
              {i > 0 && <MenuItem onSelect={() => actions.move(0)}>いちばん上へ移動</MenuItem>}
              {i > 0 && <MenuItem onSelect={() => actions.move(i - 1)}>1 つ上へ移動</MenuItem>}
              {i < count - 1 && <MenuItem onSelect={() => actions.move(i + 1)}>1 つ下へ移動</MenuItem>}
              {i < count - 1 && <MenuItem onSelect={() => actions.move(count - 1)}>いちばん下へ移動</MenuItem>}
              {onAsk && !compact && <div className="menu-separator" role="separator" />}
              {onAsk && !compact && <AskMenuItems onAsk={onAsk} what="この指示" />}
              <div className="menu-separator" role="separator" />
              <MenuItem danger onSelect={actions.remove}>
                送信待ちから消す
              </MenuItem>
            </>
          )}
        </PopupMenu>
      )}
    </>
  );
}

/** 新しいチャットで聞く（送信待ちに残す）・新しいチャットに移す（送信待ちから外す）。文と添付（画像も）を新しいチャットのタブに入れて開く */
function AskMenuItems({ onAsk, what }: { onAsk: (remove: boolean) => void; what: string }) {
  return (
    <>
      <MenuItem onSelect={() => onAsk(false)} title={`${what}を新しいチャットのタブに入れて開きます。送信待ちには残り、このチャットでもあとで送られます`}>
        新しいチャットで聞く（送信待ちに残す）
      </MenuItem>
      <MenuItem onSelect={() => onAsk(true)} title={`${what}を新しいチャットのタブに入れて開き、送信待ちから外します（このチャットでは送りません）`}>
        新しいチャットに移す（送信待ちから外す）
      </MenuItem>
    </>
  );
}
