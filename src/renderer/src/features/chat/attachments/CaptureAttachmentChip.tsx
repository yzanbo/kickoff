import { CircleDot, Container, Database, Workflow, GitPullRequest, MessageSquareCode, Monitor, ShieldAlert, SquareTerminal, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ATTACHMENT_SOURCE_LABELS, isExternalSource } from "@shared/attachment/sources";
import type { AttachmentSourceType, CaptureAttachment } from "@shared/types";
import { api, attachmentUrl } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { formatDayTime } from "@/lib/time";
import { CloseButton } from "@/ui/IconButton";
import { ErrorText } from "@/ui/ErrorText";
import { captureSubline, captureTitle } from "./captureLabels";

/** 出どころごとのアイコン（札・中身を見るダイアログで同じ） */
const SOURCE_ICONS: Record<AttachmentSourceType, LucideIcon> = {
  github_issue: CircleDot,
  github_pull: GitPullRequest,
  github_review: MessageSquareCode,
  db_failure: Database,
  browser_console: TriangleAlert,
  browser_screen: Monitor,
  terminal: SquareTerminal,
  docker_logs: Container,
  ci_log: Workflow,
};

/** 画像の札か（ブラウザの画面など。コアが受けるのは画面で見られる形式だけ） */
const isImage = (a: CaptureAttachment) => a.mime.startsWith("image/");

/**
 * 「AI に渡す」で取ったものの札（出どころのアイコン・名前・種類と取った時刻。外から来た中身は盾の印。画像はアイコンの代わりに小さく出す）。
 * 押すと取った中身を読むだけのダイアログで見る（送ったあとも）
 */
export function CaptureAttachmentChip({ attachment, onRemove }: { attachment: CaptureAttachment; onRemove?: () => void }) {
  const [viewing, setViewing] = useState(false);
  const Icon = SOURCE_ICONS[attachment.source.type];
  const external = isExternalSource(attachment.source.type);
  return (
    <span className="attachment capture-attachment" title={captureTitle(attachment, formatDayTime)}>
      <button type="button" className="attachment-link" aria-label={`${attachment.source.label} の中身を見る`} onClick={() => setViewing(true)}>
        {isImage(attachment) ? (
          <img className="attachment-thumb" src={attachmentUrl(attachment)} alt="" />
        ) : (
          <span className="attachment-icon">
            <Icon size={16} aria-hidden />
          </span>
        )}
        <span className="attachment-meta">
          {/* 名前が長くても盾の印は隠さない（名前の文字だけを切る） */}
          <span className="attachment-name">
            <span className="capture-name-text">{attachment.source.label}</span>
            {external && <ShieldAlert size={12} className="capture-external" aria-label="外から来たデータ" />}
          </span>
          <span className="muted small">{captureSubline(attachment, formatDayTime)}</span>
        </span>
      </button>
      {onRemove && (
        <button type="button" className="chip-remove" aria-label={`${attachment.source.label} を外す`} onClick={onRemove}>
          ×
        </button>
      )}
      {viewing && <CaptureViewer attachment={attachment} onClose={() => setViewing(false)} />}
    </span>
  );
}

/** 取った中身を読むだけで見るダイアログ（画像はそのまま出す） */
function CaptureViewer({ attachment, onClose }: { attachment: CaptureAttachment; onClose: () => void }) {
  const dialog = useModalDialog({ focusSelf: true });
  const image = isImage(attachment);
  const text = useAsync(() => (image ? Promise.resolve("") : api.attachmentText(attachment)), [attachment.id]);
  const Icon = SOURCE_ICONS[attachment.source.type];
  return (
    <dialog ref={dialog.ref} className="dialog app-dialog capture-viewer" aria-label={attachment.source.label} onClose={onClose} {...dialog.backdropProps}>
      <div className="capture-viewer-head">
        <Icon size={16} aria-hidden />
        <span className="capture-viewer-title">
          {ATTACHMENT_SOURCE_LABELS[attachment.source.type]}「{attachment.source.label}」
        </span>
        <CloseButton label="閉じる" onClick={() => dialog.close()} size={16} />
      </div>
      <p className="small muted capture-viewer-note">{captureTitle(attachment, formatDayTime).split("\n").slice(1).join(" / ")}</p>
      {text.loading && <p className="small muted">読み込み中…</p>}
      <ErrorText message={text.error} />
      {image ? (
        <img className="capture-viewer-image" src={attachmentUrl(attachment)} alt={attachment.source.label} />
      ) : (
        text.data !== undefined && <pre className="capture-viewer-body">{text.data}</pre>
      )}
    </dialog>
  );
}
