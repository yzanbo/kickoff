import type { Attachment } from "@shared/types";
import { useState } from "react";
import { attachmentUrl } from "@/api";
import { ImageViewer, type ViewerImage } from "@/ui/imageViewer/ImageViewer";
import { useImageMenu } from "@/ui/imageViewer/useImageMenu";

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
  const [viewing, setViewing] = useState(false);
  const imageMenu = useImageMenu();
  const isImage = isPreviewable(attachment.mime);
  const src = previewUrl ?? (attachment.id ? attachmentUrl(attachment as Attachment) : undefined);
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
          onClick={() => setViewing(true)}
          onContextMenu={(e) => imageMenu.open(e, { src, name: attachment.name }, () => setViewing(true))}
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
      {imageMenu.element}
      {viewing && src && <AttachmentViewer src={src} name={attachment.name} siblings={siblings} onClose={() => setViewing(false)} />}
    </span>
  );
}

/** 添付の画像を大きく見る（同じ発言の画像があれば、押した画像から前後に移って見られる） */
function AttachmentViewer({ src, name, siblings, onClose }: { src: string; name: string; siblings?: Attachment[]; onClose: () => void }) {
  const images = siblings ? viewerImagesOf(siblings) : [];
  const index = images.findIndex((image) => image.src === src);
  if (index < 0) return <ImageViewer src={src} name={name} onClose={onClose} />;
  return <ImageViewer images={images} index={index} onClose={onClose} />;
}
