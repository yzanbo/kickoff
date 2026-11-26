import { StickyNote } from "lucide-react";
import type { Attachment, NoteAttachment } from "@shared/chat/types";
import { attachmentUrl } from "@/features/attachments/ui/api/uploads";
import { open } from "@/foundation/ui/navigation/open";
import { knownChat, useOptionalChatScreen } from "@/features/chat/ui";
import { FileIcon } from "@/foundation/ui/code/FileIcon";
import { formatDayTime } from "@/foundation/ui/lib/time";
import { cx } from "@/foundation/ui/lib/cx";
import { AttachmentCard } from "./AttachmentCard";
import { ATTACHMENT_CARDS, type ChipAttachment, type FileChip } from "./attachmentCards";
import { CaptureAttachmentChip } from "./CaptureAttachmentChip";
import { useAttachmentViewer, type AttachmentViewerImage } from "./useAttachmentViewer";
import { useFileMenu, type SavedFile } from "./useFileMenu";

const PREVIEWABLE = /^image\/(png|jpeg|gif|webp)$/;

/** アプリの中で大きく見られる画像か */
export const isPreviewable = (mime: string) => PREVIEWABLE.test(mime);

/** 添付のうち画像だけを、大きく見る一覧にする（同じ発言・送信待ちの行の画像を前後に移って見る） */
export function viewerImagesOf(attachments: Attachment[]): AttachmentViewerImage[] {
  return attachments.filter((a) => isPreviewable(a.mime)).map((a) => ({ src: attachmentUrl(a), name: a.name, uploadId: a.id }));
}

/**
 * 添付の表示（種類ごと: ファイル = 画像はサムネイル、それ以外はファイルの種類のアイコンと名前・種類・大きさ / ノート / 「AI に渡す」で取ったもの）。
 * どれも同じ骨組みの札（AttachmentCard）で、文は種類ごとの表（ATTACHMENT_CARDS）から。
 * 画像は押すとアプリの中で大きく表示し（右クリックでコピー・保存も）、送ったファイルはアプリの中でダウンロードする（外のブラウザは使わない）。
 * 送ったファイルの右クリックは、ファイルをコピー・保存・Finder で表示・パスをコピー（useFileMenu）
 */
export function AttachmentChip({
  attachment,
  previewUrl,
  uploading,
  onRemove,
  siblings,
}: {
  attachment: ChipAttachment;
  /** 同じ発言の添付（大きく見るときに、この中の画像を前後に移って見られる） */
  siblings?: Attachment[];
  previewUrl?: string;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  if (attachment.kind === "note") return <NoteAttachmentChip attachment={attachment} onRemove={onRemove} />;
  if (attachment.kind === "capture") return <CaptureAttachmentChip attachment={attachment} onRemove={onRemove} />;
  return <FileAttachmentChip attachment={attachment} previewUrl={previewUrl} uploading={uploading} onRemove={onRemove} siblings={siblings} />;
}

/** ファイルの添付（画像はサムネイル、それ以外はファイル名とサイズ） */
function FileAttachmentChip({
  attachment,
  previewUrl,
  uploading,
  onRemove,
  siblings,
}: {
  attachment: FileChip;
  siblings?: Attachment[];
  previewUrl?: string;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  const isImage = isPreviewable(attachment.mime);
  // 保存した添付（ダウンロードと右クリックの先。選んだばかりでまだ保存していない添付は null）
  const saved: SavedFile | null = attachment.id ? { id: attachment.id, href: attachmentUrl({ id: attachment.id, mime: attachment.mime }), name: attachment.name } : null;
  const src = previewUrl ?? saved?.href;
  // 大きく見る画像: 同じ発言の画像（押した画像から前後へ）。並びにない（選んだばかりの添付など）なら、この 1 枚だけ
  const siblingImages = siblings ? viewerImagesOf(siblings) : [];
  const at = siblingImages.findIndex((image) => image.src === src);
  const viewer = useAttachmentViewer(at >= 0 ? siblingImages : src ? [{ src, name: attachment.name, uploadId: saved?.id }] : []);
  const fileMenu = useFileMenu();
  const index = Math.max(0, at);
  const text = ATTACHMENT_CARDS.file(attachment, { clock: formatDayTime, uploading });
  return (
    <AttachmentCard
      className={cx("file-attachment", uploading && "uploading")}
      title={text.title}
      thumb={isImage && src ? { src, lazy: true } : undefined}
      icon={<FileIcon name={attachment.name} />}
      name={text.name}
      sub={text.sub}
      open={
        isImage && src
          ? { kind: "button", className: "attachment-open", tip: "大きく表示", label: `${attachment.name} を大きく表示`, onClick: () => viewer.open(index), onContextMenu: (e) => viewer.menu(e, index) }
          : saved && !onRemove
            ? { kind: "download", href: saved.href, download: saved.name, onContextMenu: (e) => fileMenu.open(e, saved) }
            : undefined
      }
      onRemove={onRemove}
      removeLabel={`${attachment.name} を外す`}
    >
      {viewer.element}
      {fileMenu.element}
    </AttachmentCard>
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

/**
 * ノートの添付（ノートのフォルダからの相対パス。付けたときの写しの時刻を添える）。
 * 送った発言の中では押すとそのノートを開く（設定の開き方。チャットの画面の中だけ）
 */
function NoteAttachmentChip({ attachment, onRemove }: { attachment: NoteAttachment; onRemove?: () => void }) {
  const { note } = attachment;
  const screen = useOptionalChatScreen();
  const chat = screen && !onRemove ? knownChat(screen.chatId) : undefined;
  const text = ATTACHMENT_CARDS.note(attachment, { clock: formatDayTime });
  return (
    <AttachmentCard
      className="note-attachment"
      title={text.title}
      icon={<StickyNote size={18} aria-hidden />}
      name={text.name}
      sub={text.sub}
      open={chat ? { kind: "button", label: `ノート「${note}」を開く`, onClick: () => open({ kind: "note", projectId: chat.project_id, path: note }, { fromChatId: chat.id }) } : undefined}
      onRemove={onRemove}
      removeLabel={`ノート「${note}」を外す`}
    />
  );
}
