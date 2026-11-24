import "./CaptureAttachmentChip.css";
import { CircleDot, Container, Database, Workflow, GitPullRequest, MessageSquareCode, Monitor, ShieldAlert, SquareTerminal, TextSelect, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ATTACHMENT_SOURCE_LOOKS } from "@shared/attachments/sources";
import type { AttachmentSourceType, CaptureAttachment } from "@shared/chat/types";
import { uploadsApi, attachmentUrl } from "@/features/attachments/ui/api/uploads";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { formatDayTime } from "@/foundation/ui/lib/time";
import { CloseButton } from "@/foundation/ui/kit/IconButton";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { AttachmentCard } from "./AttachmentCard";
import { ATTACHMENT_CARDS, captureTitle } from "./attachmentCards";

/** 出どころごとのアイコン（札・中身を見るダイアログで同じ） */
const ATTACHMENT_SOURCE_ICONS: Record<AttachmentSourceType, LucideIcon> = {
  github_issue: CircleDot,
  github_pull: GitPullRequest,
  github_review: MessageSquareCode,
  db_failure: Database,
  browser_console: TriangleAlert,
  browser_screen: Monitor,
  browser_selection: TextSelect,
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
  const Icon = ATTACHMENT_SOURCE_ICONS[attachment.source.type];
  const text = ATTACHMENT_CARDS.capture(attachment, { clock: formatDayTime });
  return (
    <AttachmentCard
      className="capture-attachment"
      title={text.title}
      thumb={isImage(attachment) ? { src: attachmentUrl(attachment) } : undefined}
      icon={<Icon size={18} aria-hidden />}
      name={
        // 名前が長くても盾の印は隠さない（名前の文字だけを切る）
        <>
          <span className="capture-name-text">{text.name}</span>
          {text.external && <ShieldAlert size={12} className="capture-external" aria-label="外から来たデータ" />}
        </>
      }
      sub={text.sub}
      open={{ kind: "button", label: `${attachment.source.label} の中身を見る`, onClick: () => setViewing(true) }}
      onRemove={onRemove}
      removeLabel={`${attachment.source.label} を外す`}
    >
      {viewing && <CaptureViewer attachment={attachment} onClose={() => setViewing(false)} />}
    </AttachmentCard>
  );
}

/** 取った中身を読むだけで見るダイアログ（画像はそのまま出す） */
function CaptureViewer({ attachment, onClose }: { attachment: CaptureAttachment; onClose: () => void }) {
  const { ref: dialogRef, ...dialog } = useModalDialog({ focusSelf: true });
  const image = isImage(attachment);
  const text = useQuery(["CaptureAttachmentChip.text", attachment.id], () => (image ? Promise.resolve("") : uploadsApi.attachmentText(attachment)), { keepPrevious: true });
  const Icon = ATTACHMENT_SOURCE_ICONS[attachment.source.type];
  return (
    <dialog ref={dialogRef} className="dialog floating app-dialog capture-viewer" aria-label={attachment.source.label} onClose={onClose} {...dialog.backdropProps}>
      <div className="capture-viewer-head">
        <Icon size={16} aria-hidden />
        <span className="capture-viewer-title">
          {ATTACHMENT_SOURCE_LOOKS[attachment.source.type].label}「{attachment.source.label}」
        </span>
        <CloseButton label="閉じる" onClick={() => dialog.close()} iconSize={16} />
      </div>
      <p className="small muted capture-viewer-note">{captureTitle(attachment, formatDayTime).split("\n").slice(1).join(" / ")}</p>
      {text.loading && <p className="small muted">読み込み中…</p>}
      <ErrorText message={errorText(text.error)} />
      {image ? (
        <img className="capture-viewer-image" src={attachmentUrl(attachment)} alt={attachment.source.label} />
      ) : (
        text.data !== undefined && <pre className="capture-viewer-body">{text.data}</pre>
      )}
    </dialog>
  );
}
