import type { Attachment } from "../../../core/types";
import { attachmentUrl } from "../api";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/;

/** 添付ファイルの表示（画像はサムネイル、それ以外はファイル名とサイズ） */
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
      {attachment.id && !onRemove ? (
        <a className="attachment-link" href={attachmentUrl(attachment as Attachment)} target="_blank" rel="noreferrer">
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
    </span>
  );
}
