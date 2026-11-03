import { Check, Paperclip, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import type { Attachment } from "../../../../core/types";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { AttachmentChip } from "./AttachmentChip";
import { PendingFileChips } from "./PendingFileChips";
import { useComposerFiles } from "./useComposerFiles";

/**
 * 送信待ちの指示を書き直す欄（Enter で保存・Shift+Enter で改行・Esc でやめる）。
 * 添付は上にすべて並べ、× で外せる。📎・貼り付け・ドラッグ＆ドロップで足せる（チャット欄と同じく、選んだ時点でアップロードする）
 */
export function QueuedEditor({
  index,
  withGrip,
  text,
  attachments,
  onChange,
  onAttachmentsChange,
  onSave,
  onCancel,
}: {
  /** 送る順番（0 から。ほかの行と同じく番号を出す） */
  index: number;
  /** ほかの行につまみの印があるか（あれば同じ幅を空けて、番号の位置をそろえる） */
  withGrip: boolean;
  text: string;
  /** 残しておく添付（外したものは除いたもの） */
  attachments: Attachment[];
  onChange: (text: string) => void;
  onAttachmentsChange: (attachments: Attachment[]) => void;
  /** 保存する添付（残したもの ＋ 足してアップロードできたもの） */
  onSave: (attachments: Attachment[]) => void;
  onCancel: () => void;
}) {
  const files = useComposerFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  // アップロードの途中は保存しない（足した添付が抜け落ちないように）
  const save = () => {
    if (!files.uploading) onSave([...attachments, ...files.attachments]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      save();
    }
  };
  const hasAttachments = attachments.length > 0 || files.files.length > 0;
  return (
    <div className={cx("queued-row editing", files.dragging && "file-over")} {...files.dropProps}>
      {withGrip && <span className="queued-grip queued-grip-space" aria-hidden />}
      <span className="queued-index" aria-label={`${index + 1} 番目`}>
        {index + 1}
      </span>
      <div className="queued-editor-body">
        {hasAttachments && (
          <div className="composer-attachments queued-editor-attachments">
            {attachments.map((a) => (
              <span key={a.id} className="composer-attachment">
                <AttachmentChip attachment={a} siblings={attachments} onRemove={() => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))} />
              </span>
            ))}
            <PendingFileChips files={files.files} onRemove={files.removeFile} />
          </div>
        )}
        <textarea
          className="queued-editor"
          value={text}
          // 高さは文に合わせる（折り返した行も含めて全部見せる。CSS の field-sizing）
          rows={1}
          // 開いたら文の終わりから書き始める
          ref={(el) => {
            if (el && !el.dataset.ready) {
              el.dataset.ready = "1";
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }}
          aria-label="待ちの指示を書き直す"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={files.onPaste}
        />
      </div>
      <IconButton icon={Paperclip} label="ファイルを添付" title="ファイルを添付（貼り付け・ドラッグ＆ドロップでも）" size={13} onClick={() => inputRef.current?.click()} />
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) files.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <IconButton
        icon={Check}
        label="保存"
        title={files.uploading ? "アップロードが終わるまでお待ちください" : "保存（Enter）"}
        size={13}
        disabled={files.uploading}
        onClick={save}
      />
      <IconButton icon={X} label="やめる" title="やめる（Esc）" size={13} onClick={onCancel} />
    </div>
  );
}
