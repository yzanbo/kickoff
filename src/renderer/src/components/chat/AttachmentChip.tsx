import type { Attachment } from "../../../../core/types";
import { useState } from "react";
import { attachmentUrl } from "../../api";
import { ImageViewer } from "../ImageViewer";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/;

/**
 * 添付ファイルの表示（画像はサムネイル、それ以外はファイル名とサイズ）。
 * 画像は押すとアプリの中で大きく表示し、送ったファイルはアプリの中でダウンロードする（外のブラウザは使わない）
 */
export function AttachmentChip({
  attachment,
  previewUrl,
  uploading,
  onRemove,
}: {
  attachment: Pick<Attachment, "name" | "mime" | "size"> & { id?: string };
  previewUrl?: string;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  const [viewing, setViewing] = useState(false);
  const isImage = PREVIEWABLE.test(attachment.mime);
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
        <button type="button" className="attachment-link attachment-open" title="大きく表示" aria-label={`${attachment.name} を大きく表示`} onClick={() => setViewing(true)}>
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
      {viewing && src && <ImageViewer src={src} name={attachment.name} onClose={() => setViewing(false)} />}
    </span>
  );
}
