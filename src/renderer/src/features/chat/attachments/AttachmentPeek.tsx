import { FileText } from "lucide-react";
import { useRef, useState } from "react";
import type { Attachment } from "@shared/types";
import { attachmentUrl } from "@/api";
import { AttachmentGrid } from "./AttachmentGrid";
import { isPreviewable, viewerImagesOf } from "./AttachmentChip";
import { useAttachmentViewer } from "./useAttachmentViewer";

/**
 * 1 行に収める添付（送信待ちの行・上に貼り付ける指示の帯）。1 つ目だけを小さく出し、2 つ以上なら数を重ねる（狭い欄でも 1 行に収め、文を読めるようにする）。
 * 2 つ以上なら押すと並べて表示し、そこから全画面へ。
 * 画像は押すと大きく表示し、同じ発言の画像は ← / → で前後に移れる。
 * 画像は右クリックでコピー・保存もできる。画像以外はファイルの印と名前。乗せると、すべての添付の名前を出す
 */
export function AttachmentPeek({ attachments }: { attachments: Attachment[] }) {
  // 大きく見る画像（同じ指示の画像。画像の右クリックでコピー・保存も。外の行の右クリックのメニューには伝えない）と、
  // 添付が複数のときに開く一覧（開いたボタンの上に出す）
  const viewer = useAttachmentViewer(viewerImagesOf(attachments));
  const [grid, setGrid] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => isPreviewable(a.mime));
  // 行では、画像を先にして 1 つ目だけを出す
  const shown = [images[0] ?? attachments[0]];
  const rest = attachments.length - shown.length;
  const names = attachments.map((a) => a.name).join("\n");
  // 行で複数の添付を 1 つにまとめているときは、まず一覧を開き、そこから全画面へ（1 つだけなら、すぐ全画面）
  // 開いているときに押したら閉じる（以前は外側のクリックとして閉じたあと、続くクリックで開き直していた）
  const openGrid = rest > 0 ? () => setGrid((open) => !open) : undefined;
  return (
    <span className="attach-peek" title={`添付 ${attachments.length} 件\n${names}`}>
      {shown.map((a) =>
        isPreviewable(a.mime) ? (
          <button
            key={a.id}
            ref={openGrid ? opener : undefined}
            type="button"
            className="attach-peek-thumb"
            title={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name}（大きく表示${images.length > 1 ? `。ほかの画像へは ← / →` : ""}）`}
            aria-expanded={openGrid ? grid : undefined}
            aria-label={openGrid ? `添付 ${attachments.length} 件を並べて表示` : `${a.name} を大きく表示`}
            onClick={openGrid ?? (() => viewer.open(images.indexOf(a)))}
            onContextMenu={(e) => viewer.menu(e, images.indexOf(a))}
          >
            <img src={attachmentUrl(a)} alt="" />
            {rest > 0 && (
              <span className="attach-peek-count" aria-label={`ほか ${rest} 件`}>
                +{rest}
              </span>
            )}
          </button>
        ) : openGrid ? (
          <button key={a.id} ref={opener} type="button" className="attach-peek-file" title={`添付 ${attachments.length} 件を並べて表示`} onClick={openGrid}>
            <FileText size={12} aria-hidden />
            <span className="attach-peek-file-name">{a.name}</span>
            <span className="attach-peek-file-count">+{rest}</span>
          </button>
        ) : (
          <span key={a.id} className="attach-peek-file">
            <FileText size={12} aria-hidden />
            <span className="attach-peek-file-name">{a.name}</span>
          </span>
        ),
      )}
      {viewer.element}
      {grid && <AttachmentGrid attachments={attachments} anchor={opener} onClose={() => setGrid(false)} />}
    </span>
  );
}
