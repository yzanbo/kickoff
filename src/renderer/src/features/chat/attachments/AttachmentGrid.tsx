import type { RefObject } from "react";
import type { Attachment } from "@shared/types";
import { attachmentUrl } from "@/api";
import { Popover } from "@/ui/Popover";
import { AttachmentChip, isPreviewable, viewerImagesOf } from "./AttachmentChip";
import { useAttachmentViewer } from "./useAttachmentViewer";

/**
 * 添付の一覧のポップオーバー（送信待ちの行の「+n」付きのサムネイルから開く）。
 * 画像は大きめのサムネイルで並べ、押すと全画面で表示する（← / → でほかの画像へ）。画像以外はファイル名で、押すとアプリの中でダウンロード。
 * 送信待ちの一覧は中でスクロールして切り取られ、行の文字の大きさ・折り返しも受け継がないよう body の直下に出し、開いたボタンの上（入らなければ下）に置く
 */
export function AttachmentGrid({ attachments, anchor, onClose }: { attachments: Attachment[]; anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  // 全画面で見ている画像と、画像の右クリック（コピー・大きく表示・保存）。メニューは一覧の外に出るので、
  // 全画面で見ている・メニューを開いている間は、一覧の外側クリック・Esc で一覧を閉じない
  const viewer = useAttachmentViewer(viewerImagesOf(attachments));
  const images = attachments.filter((a) => isPreviewable(a.mime));
  const files = attachments.filter((a) => !isPreviewable(a.mime));
  const title = `添付 ${attachments.length} 件`;
  return (
    <Popover
      anchor={anchor}
      side="above"
      portal
      title={title}
      label={title}
      className="attachment-grid-popover"
      dismissable={!viewer.active}
      onClose={onClose}
      // 開いた元の行（送信待ち）のダブルクリック（書き直す）・右クリックのメニューに伝えない
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {images.length > 0 && (
        <div className="attachment-grid">
          {images.map((a, i) => (
            <button key={a.id} type="button" className="attachment-grid-item" title={`${a.name}（全画面で表示）`} aria-label={`${a.name} を全画面で表示`}
              onClick={() => viewer.open(i)}
              onContextMenu={(e) => viewer.menu(e, i)}
            >
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
      {viewer.element}
    </Popover>
  );
}
