import type { Attachment } from "@shared/types";
import { attachmentUrl } from "@/api";
import type { ViewerImage } from "@/ui/imageViewer/ImageViewer";
import { useAttachmentViewer } from "./useAttachmentViewer";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/;

/** アプリの中で大きく見られる画像か */
export const isPreviewable = (mime: string) => PREVIEWABLE.test(mime);

/** 添付のうち画像だけを、大きく見る一覧にする（同じ発言・送信待ちの行の画像を前後に移って見る） */
export function viewerImagesOf(attachments: Attachment[]): ViewerImage[] {
  return attachments.filter((a) => isPreviewable(a.mime)).map((a) => ({ src: attachmentUrl(a), name: a.name }));
}

/**
 * 添付ファイルの表示（画像はサムネイル、それ以外はファイル名とサイズ）。
 * 画像は押すとアプリの中で大きく表示し（右クリックでコピー・保存も）、送ったファイルはアプリの中でダウンロードする（外のブラウザは使わない）
 */
export function AttachmentChip({
  attachment,
  previewUrl,
  uploading,
  onRemove,
  siblings,
}: {
  attachment: Pick<Attachment, "name" | "mime" | "size"> & { id?: string };
  /** 同じ発言の添付（大きく見るときに、この中の画像を前後に移って見られる） */
  siblings?: Attachment[];
  previewUrl?: string;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  const isImage = isPreviewable(attachment.mime);
  const src = previewUrl ?? (attachment.id ? attachmentUrl(attachment as Attachment) : undefined);
  // 大きく見る画像: 同じ発言の画像（押した画像から前後へ）。並びにない（選んだばかりの添付など）なら、この 1 枚だけ
  const siblingImages = siblings ? viewerImagesOf(siblings) : [];
  const at = siblingImages.findIndex((image) => image.src === src);
  const viewer = useAttachmentViewer(at >= 0 ? siblingImages : src ? [{ src, name: attachment.name }] : []);
  const index = Math.max(0, at);
  const body = (
    <>
      {isImage && src ? <img className="attachment-thumb" src={src} alt="" /> : <span className="attachment-icon">📄</span>}
      <span className="attachment-meta">
        <span className="attachment-name">{attachment.name}</span>
        <span className="muted small">{uploading ? "アップロード中…" : formatBytes(attachment.size)}</span>
      </span>
    </>
  );
  return (
    <span className={`attachment ${uploading ? "uploading" : ""}`}>
      {isImage && src ? (
        <button type="button" className="attachment-link attachment-open" title="大きく表示" aria-label={`${attachment.name} を大きく表示`}
          onClick={() => viewer.open(index)}
          onContextMenu={(e) => viewer.menu(e, index)}
        >
          {body}
        </button>
      ) : attachment.id && !onRemove ? (
        <a className="attachment-link" href={attachmentUrl(attachment as Attachment)} download={attachment.name}>
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove && (
        <button type="button" className="chip-remove" aria-label={`${attachment.name} を外す`} onClick={onRemove}>
          ×
        </button>
      )}
      {viewer.element}
    </span>
  );
}

/**
 * 送った・保存した添付の並び（発言の吹き出し・質問への回答・送信待ちの書き直し）。画像は押すと大きく表示し、同じ並びの画像は ← / → で前後へ。
 * onRemove を渡すと × で外せる（選んだばかりの添付と同じ枠に入れる）
 */
export function AttachmentChips({ attachments, onRemove }: { attachments: Attachment[]; onRemove?: (attachment: Attachment) => void }) {
  return attachments.map((a) =>
    onRemove ? (
      <span key={a.id} className="composer-attachment">
        <AttachmentChip attachment={a} siblings={attachments} onRemove={() => onRemove(a)} />
      </span>
    ) : (
      <AttachmentChip key={a.id} attachment={a} siblings={attachments} />
    ),
  );
}
