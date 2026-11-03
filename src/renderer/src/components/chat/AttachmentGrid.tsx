import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Attachment } from "../../../../core/types";
import { attachmentUrl } from "../../api";
import { useDismiss } from "../../hooks/useDismiss";
import { ImageViewer } from "../ImageViewer";
import { PopoverHeader } from "../PopoverHeader";
import { AttachmentChip, isPreviewable, viewerImagesOf } from "./AttachmentChip";

/**
 * 添付の一覧のポップオーバー（送信待ちの行の「+n」付きのサムネイルから開く）。
 * 画像は大きめのサムネイルで並べ、押すと全画面で表示する（← / → でほかの画像へ）。画像以外はファイル名で、押すとアプリの中でダウンロード。
 * 送信待ちの一覧は中でスクロールして切り取られるので、body の直下に出し、開いたボタンの上（入らなければ下）に置く
 */
export function AttachmentGrid({ attachments, anchor, onClose }: { attachments: Attachment[]; anchor: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // 全画面で見ている画像（画像の中の位置）。見ている間は一覧の外側クリック・Esc で一覧を閉じない
  const [viewing, setViewing] = useState<number>();
  useDismiss(ref, onClose, { enabled: viewing === undefined });
  const images = attachments.filter((a) => isPreviewable(a.mime));
  const files = attachments.filter((a) => !isPreviewable(a.mime));
  const width = Math.min(360, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  // 上に入るなら上、入らなければ下に出す
  const above = anchor.top > 280;
  const style: CSSProperties = above ? { left, width, bottom: window.innerHeight - anchor.top + 6 } : { left, width, top: anchor.bottom + 6 };
  return createPortal(
    <div
      ref={ref}
      className="attachment-grid-popover"
      style={style}
      role="dialog"
      aria-label={`添付 ${attachments.length} 件`}
      // 開いた元の行（送信待ち）のダブルクリック（書き直す）・右クリックのメニューに伝えない
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <PopoverHeader title={`添付 ${attachments.length} 件`} onClose={onClose} />
      {images.length > 0 && (
        <div className="attachment-grid">
          {images.map((a, i) => (
            <button key={a.id} type="button" className="attachment-grid-item" title={`${a.name}（全画面で表示）`} aria-label={`${a.name} を全画面で表示`} onClick={() => setViewing(i)}>
              <img src={attachmentUrl(a)} alt="" />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="attachment-grid-files">
          {files.map((a) => (
            <AttachmentChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
      {viewing !== undefined && <ImageViewer images={viewerImagesOf(attachments)} index={viewing} onClose={() => setViewing(undefined)} />}
    </div>,
    document.body,
  );
}
