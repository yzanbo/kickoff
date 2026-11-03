import { ArrowDown, ArrowUp, FileText, GripVertical, Pencil, SendHorizontal, Trash2 } from "lucide-react";
import { useState, type DragEvent, type MouseEvent } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";
import { useImageMenu } from "../imageViewer/useImageMenu";
import { IconButton } from "../IconButton";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import { AttachmentGrid } from "./AttachmentGrid";
import { isPreviewable, viewerImagesOf } from "./AttachmentChip";

/** 送信待ちの 1 行への操作（行のボタンと右クリックのメニューで共通） */
export interface QueuedRowActions {
  edit: () => void;
  /** この指示のすぐあとの「ここまで送ったら止めます」を付ける・外す */
  toggleStop: () => void;
  move: (to: number) => void;
  sendNow: () => void;
  remove: () => void;
}

/** まとめて動かすときのドラッグの絵（「n 件を移動」の札。絵を写したらすぐ消す） */
function setCountDragImage(dataTransfer: DataTransfer, count: number) {
  const badge = document.createElement("div");
  badge.className = "queued-drag-badge";
  badge.textContent = `${count} 件を移動`;
  document.body.appendChild(badge);
  dataTransfer.setDragImage(badge, 12, 12);
  setTimeout(() => badge.remove(), 0);
}

/**
 * 送信待ちの 1 行: つまみ（ドラッグで並べ替え。2 件以上のとき）・番号・添付・文・操作のボタン。
 * 文は選んでコピーでき、ダブルクリックで書き直す。右クリックでも同じ操作（狭いときに隠す ↑↓ もここに残す）。
 * ⌘ / Ctrl ＋クリックで 1 件ずつ、Shift ＋クリックで範囲を選び、選んでいる行の右クリックは選んだもの全体への操作になる
 */
export function QueuedRow({
  message: m,
  index: i,
  count,
  busy,
  selectedCount,
  dragCount = 1,
  isStop,
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
  /** この指示のすぐあとに「ここまで送ったら止めます」があるか */
  isStop: boolean;
  /** 新しいチャットで聞く（文と添付を新しいチャットのタブに入れて開く。remove なら送信待ちから外す = 移す。選んでいれば選んだものすべて） */
  onAsk?: (remove: boolean) => void;
  /** 行のクリック（⌘ / Ctrl で 1 件ずつ、Shift で範囲を選ぶ） */
  onSelect: (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void;
  /** 選んだもの全体への操作（右クリックのメニュー） */
  groupActions: { sendTogether: () => void; moveTo: (to: "top" | "bottom") => void; remove: () => void };
  className: string;
  actions: QueuedRowActions;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  // 作業中は止めずに、いまのやり取りに伝える（作業していなければ、すぐ送る）
  const sendLabel = busy ? "いま伝える（作業は止めない）" : "いますぐ送る";
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
        if ((e.target as HTMLElement).closest("button")) return;
        actions.edit();
      }}
      onContextMenu={(e: MouseEvent) => {
        // 文を選んでいるときは、コピーのための既定のメニューに任せる
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        // 行は画面の下のほう（チャット欄のすぐ上）にあるので、メニューの大きさ（項目と区切り線で 400px ほど）を見て、下にはみ出すなら上へ寄せる
        setMenu(clampToViewport(e.clientX, e.clientY, 300, 400));
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
            // 動かしている間の絵は、つまみだけでなく行全体にする（まとめて動かすときは「n 件を移動」の札）
            const row = e.currentTarget.parentElement;
            if (dragCount > 1) setCountDragImage(e.dataTransfer, dragCount);
            else if (row) {
              const r = row.getBoundingClientRect();
              e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top);
            }
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
      <QueuedAttachments attachments={m.attachments} />
      <span className="queued-text" title={m.text}>
        {m.text || m.attachments.map((a) => a.name).join("、")}
      </span>
      <IconButton icon={Pencil} label="文を書き直す" title="文を書き直す（ダブルクリックでも）" size={13} onClick={actions.edit} />
      <IconButton icon={ArrowUp} label="1 つ上へ移動" size={13} className="queued-move" disabled={i === 0} onClick={() => actions.move(i - 1)} />
      <IconButton icon={ArrowDown} label="1 つ下へ移動" size={13} className="queued-move" disabled={i === count - 1} onClick={() => actions.move(i + 1)} />
      <IconButton icon={SendHorizontal} label={sendLabel} size={13} onClick={actions.sendNow} />
      <IconButton icon={Trash2} label="送信待ちから消す" size={13} onClick={actions.remove} />
    </div>
      {/* メニューは行の外に置く（行のダブルクリック・右クリックがメニューの中に効かないように） */}
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} label="送信待ちの指示の操作" onClose={() => setMenu(undefined)}>
          {selectedCount > 1 ? (
            // 選んだもの全体への操作（送る → 並べ替え → 新しいチャットへ → 消す）
            <>
              <MenuItem onSelect={groupActions.sendTogether}>選んだ {selectedCount} 件をまとめて送る</MenuItem>
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
            // 1 件への操作（書き直す → 送る・止める → 並べ替え → 新しいチャットへ → 消す）
            <>
              <MenuItem onSelect={actions.edit}>文を書き直す</MenuItem>
              <div className="menu-separator" role="separator" />
              <MenuItem onSelect={actions.sendNow}>{sendLabel}</MenuItem>
              <MenuItem
                onSelect={actions.toggleStop}
                title={isStop ? "この指示のあとの「ここまで送ったら止めます」を外します" : "この指示まで自動で送ったら、残りは送らずに止めておきます（線はドラッグで動かせます）"}
              >
                {isStop ? "この指示のあとで止めない" : "この指示のあとで止める"}
              </MenuItem>
              {count > 1 && <div className="menu-separator" role="separator" />}
              {i > 0 && <MenuItem onSelect={() => actions.move(0)}>いちばん上へ移動</MenuItem>}
              {i > 0 && <MenuItem onSelect={() => actions.move(i - 1)}>1 つ上へ移動</MenuItem>}
              {i < count - 1 && <MenuItem onSelect={() => actions.move(i + 1)}>1 つ下へ移動</MenuItem>}
              {i < count - 1 && <MenuItem onSelect={() => actions.move(count - 1)}>いちばん下へ移動</MenuItem>}
              {onAsk && <div className="menu-separator" role="separator" />}
              {onAsk && <AskMenuItems onAsk={onAsk} what="この指示" />}
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

/**
 * 送信待ちの添付。行では 1 つ目だけを小さく出し、2 つ以上なら数を重ねる（狭い欄でも 1 行に収め、文を読めるようにする）。
 * 画像は押すと大きく表示し、同じ指示の画像は ← / → で前後に移れる。
 * 画像は右クリックでコピー・保存もできる。画像以外はファイルの印と名前。乗せると、すべての添付の名前を出す
 */
export function QueuedAttachments({ attachments }: { attachments: Attachment[] }) {
  // 大きく見ている画像（同じ指示の画像の中の位置）と、添付が複数のときに開く一覧（開いたボタンの位置）
  const [viewing, setViewing] = useState<number>();
  const [grid, setGrid] = useState<DOMRect>();
  // 画像の右クリック（コピー・大きく表示・保存。行の右クリックのメニューには伝えない）
  const imageMenu = useImageMenu();
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => isPreviewable(a.mime));
  // 行では、画像を先にして 1 つ目だけを出す
  const shown = [images[0] ?? attachments[0]];
  const rest = attachments.length - shown.length;
  const names = attachments.map((a) => a.name).join("\n");
  // 行で複数の添付を 1 つにまとめているときは、まず一覧を開き、そこから全画面へ（1 つだけなら、すぐ全画面）
  const openGrid = rest > 0 ? (e: MouseEvent<HTMLElement>) => setGrid(e.currentTarget.getBoundingClientRect()) : undefined;
  return (
    <span className="queued-attachments" title={`添付 ${attachments.length} 件\n${names}`}>
      {shown.map((a) =>
        isPreviewable(a.mime) ? (
          <button
            key={a.id}
            type="button"
            className="queued-thumb"
            title={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name}（大きく表示${images.length > 1 ? `。ほかの画像へは ← / →` : ""}）`}
            aria-label={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name} を大きく表示`}
            onClick={openGrid ?? (() => setViewing(images.indexOf(a)))}
            onContextMenu={(e) => imageMenu.open(e, { src: attachmentUrl(a), name: a.name }, () => setViewing(images.indexOf(a)))}
          >
            <img src={attachmentUrl(a)} alt="" />
            {rest > 0 && (
              <span className="queued-thumb-count" aria-label={`ほか ${rest} 件`}>
                +{rest}
              </span>
            )}
          </button>
        ) : openGrid ? (
          <button key={a.id} type="button" className="queued-file" title={`添付 ${attachments.length} 件を並べて表示`} onClick={openGrid}>
            <FileText size={12} aria-hidden />
            <span className="queued-file-name">{a.name}</span>
            <span className="queued-file-count">+{rest}</span>
          </button>
        ) : (
          <span key={a.id} className="queued-file">
            <FileText size={12} aria-hidden />
            <span className="queued-file-name">{a.name}</span>
          </span>
        ),
      )}
      {imageMenu.element}
      {viewing !== undefined && <ImageViewer images={viewerImagesOf(attachments)} index={viewing} onClose={() => setViewing(undefined)} />}
      {grid && <AttachmentGrid attachments={attachments} anchor={grid} onClose={() => setGrid(undefined)} />}
    </span>
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
