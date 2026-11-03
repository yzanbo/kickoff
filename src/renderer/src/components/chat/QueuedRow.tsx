import { ArrowDown, ArrowUp, Check, FileText, GripVertical, Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import type { Attachment, QueuedMessage } from "../../../../core/types";
import { attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";
import { IconButton } from "../IconButton";
import { clampToViewport, MenuItem, PopupMenu } from "../PopupMenu";
import { AttachmentGrid } from "./AttachmentGrid";
import { isPreviewable, viewerImagesOf } from "./AttachmentChip";

/** 送信待ちの 1 行への操作（行のボタンと右クリックのメニューで共通） */
export interface QueuedRowActions {
  edit: () => void;
  move: (to: number) => void;
  sendNow: () => void;
  remove: () => void;
}

/**
 * 送信待ちの 1 行: つまみ（ドラッグで並べ替え。2 件以上のとき）・番号・添付・文・操作のボタン。
 * 文は選んでコピーでき、ダブルクリックで書き直す。右クリックでも同じ操作（狭いときに隠す ↑↓ もここに残す）
 */
export function QueuedRow({
  message: m,
  index: i,
  count,
  busy,
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
  className: string;
  actions: QueuedRowActions;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const sendLabel = busy ? "いまの作業を止めて、すぐ送る" : "すぐ送る";
  return (
    <>
    <div
      className={className}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        // ボタン・サムネイルのダブルクリックは除く
        if ((e.target as HTMLElement).closest("button")) return;
        actions.edit();
      }}
      onContextMenu={(e: MouseEvent) => {
        // 文を選んでいるときは、コピーのための既定のメニューに任せる
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        setMenu(clampToViewport(e.clientX, e.clientY, 220, 180));
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
            // 動かしている間の絵は、つまみだけでなく行全体にする
            const row = e.currentTarget.parentElement;
            if (row) {
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
      <IconButton icon={Pencil} label="書き直す" title="書き直す（ダブルクリックでも）" size={13} onClick={actions.edit} />
      <IconButton icon={ArrowUp} label="上へ" size={13} className="queued-move" disabled={i === 0} onClick={() => actions.move(i - 1)} />
      <IconButton icon={ArrowDown} label="下へ" size={13} className="queued-move" disabled={i === count - 1} onClick={() => actions.move(i + 1)} />
      <IconButton icon={SendHorizontal} label={sendLabel} size={13} onClick={actions.sendNow} />
      <IconButton icon={Trash2} label="待ちの列から消す" size={13} onClick={actions.remove} />
    </div>
      {/* メニューは行の外に置く（行のダブルクリック・右クリックがメニューの中に効かないように） */}
      {menu && (
        <PopupMenu x={menu.x} y={menu.y} label="送信待ちの指示の操作" onClose={() => setMenu(undefined)}>
          <MenuItem onSelect={actions.edit}>書き直す</MenuItem>
          <MenuItem onSelect={actions.sendNow}>{sendLabel}</MenuItem>
          {i > 0 && <MenuItem onSelect={() => actions.move(0)}>いちばん上へ</MenuItem>}
          {i > 0 && <MenuItem onSelect={() => actions.move(i - 1)}>上へ</MenuItem>}
          {i < count - 1 && <MenuItem onSelect={() => actions.move(i + 1)}>下へ</MenuItem>}
          {i < count - 1 && <MenuItem onSelect={() => actions.move(count - 1)}>いちばん下へ</MenuItem>}
          <MenuItem danger onSelect={actions.remove}>
            待ちの列から消す
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}

/**
 * 送信待ちの添付。行では 1 つ目だけを小さく出し、2 つ以上なら数を重ねる（狭い欄でも 1 行に収め、文を読めるようにする）。
 * 書き直している間（all）は、すべてを並べて出す（折り返す）。画像は押すと大きく表示し、同じ指示の画像は ← / → で前後に移れる。
 * 画像以外はファイルの印と名前。乗せると、すべての添付の名前を出す
 */
export function QueuedAttachments({ attachments, all = false }: { attachments: Attachment[]; all?: boolean }) {
  // 大きく見ている画像（同じ指示の画像の中の位置）と、添付が複数のときに開く一覧（開いたボタンの位置）
  const [viewing, setViewing] = useState<number>();
  const [grid, setGrid] = useState<DOMRect>();
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => isPreviewable(a.mime));
  // 行では、画像を先にして 1 つ目だけを出す
  const shown = all ? attachments : [images[0] ?? attachments[0]];
  const rest = attachments.length - shown.length;
  const names = attachments.map((a) => a.name).join("\n");
  // 行で複数の添付を 1 つにまとめているときは、まず一覧を開き、そこから全画面へ（1 つだけなら、すぐ全画面）
  const openGrid = rest > 0 ? (e: MouseEvent<HTMLElement>) => setGrid(e.currentTarget.getBoundingClientRect()) : undefined;
  return (
    <span className={all ? "queued-attachments all" : "queued-attachments"} title={all ? undefined : `添付 ${attachments.length} 件\n${names}`}>
      {shown.map((a) =>
        isPreviewable(a.mime) ? (
          <button
            key={a.id}
            type="button"
            className="queued-thumb"
            title={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name}（大きく表示${images.length > 1 ? `。ほかの画像へは ← / →` : ""}）`}
            aria-label={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name} を大きく表示`}
            onClick={openGrid ?? (() => setViewing(images.indexOf(a)))}
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
          <span key={a.id} className="queued-file" title={all ? a.name : undefined}>
            <FileText size={12} aria-hidden />
            <span className="queued-file-name">{a.name}</span>
          </span>
        ),
      )}
      {viewing !== undefined && <ImageViewer images={viewerImagesOf(attachments)} index={viewing} onClose={() => setViewing(undefined)} />}
      {grid && <AttachmentGrid attachments={attachments} anchor={grid} onClose={() => setGrid(undefined)} />}
    </span>
  );
}

/** 送信待ちの指示を書き直す欄（Enter で保存・Shift+Enter で改行・Esc でやめる。添付は上にすべて並べる） */
export function QueuedEditor({
  index,
  withGrip,
  attachments,
  text,
  onChange,
  onSave,
  onCancel,
}: {
  /** 送る順番（0 から。ほかの行と同じく番号を出す） */
  index: number;
  /** ほかの行につまみの印があるか（あれば同じ幅を空けて、番号の位置をそろえる） */
  withGrip: boolean;
  attachments: Attachment[];
  text: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      onSave();
    }
  };
  return (
    <div className="queued-row editing">
      {withGrip && <span className="queued-grip queued-grip-space" aria-hidden />}
      <span className="queued-index" aria-label={`${index + 1} 番目`}>
        {index + 1}
      </span>
      <div className="queued-editor-body">
        <QueuedAttachments attachments={attachments} all />
        <textarea
          className="queued-editor"
          value={text}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          // 開いたら文の終わりから書き始める
          ref={(el) => {
            if (el && !el.dataset.ready) {
              el.dataset.ready = "1";
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }}
          aria-label="待ちの指示を書き直す"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <IconButton icon={Check} label="保存" title="保存（Enter）" size={13} onClick={onSave} />
      <IconButton icon={X} label="やめる" title="やめる（Esc）" size={13} onClick={onCancel} />
    </div>
  );
}
