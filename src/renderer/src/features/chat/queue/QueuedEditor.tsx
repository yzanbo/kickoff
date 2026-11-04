import { Check, Paperclip, SendHorizontal, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { AttachmentChip } from "@/features/chat/attachments/AttachmentChip";
import { PendingFileChips } from "@/features/chat/attachments/PendingFileChips";
import { useComposerFiles } from "@/features/chat/attachments/useComposerFiles";

/**
 * 送信待ちの指示を書き直す欄（Enter で保存・⌘Enter で保存していま送る（チャット欄の「いま」と同じ。作業中なら止めずにいまのやり取りに足す）・
 * Shift+Enter で改行・Esc でやめる）。⌘ を押している間は、⌘Enter で使われる「保存していま送る」のボタンを青く光らせる（チャット欄と同じ）。
 * 添付は上にすべて並べ、× で外せる。📎・貼り付け・ドラッグ＆ドロップで足せる（チャット欄と同じく、選んだ時点でアップロードする）
 */
export function QueuedEditor({
  id,
  index,
  withGrip,
  busy,
  ready,
  text,
  attachments,
  onChange,
  onAttachmentsChange,
  onSave,
  onSaveAndSend,
  onCancel,
}: {
  /** 書き直している指示の ID（いくつも開いているとき、開いたばかりの欄を見えるところへ動かすのに使う） */
  id: string;
  /** 送る順番（0 から。ほかの行と同じく番号を出す） */
  index: number;
  /** ほかの行につまみの印があるか（あれば同じ幅を空けて、番号の位置をそろえる） */
  withGrip: boolean;
  /** 作業中か（「いま送る」の説明を変える。作業中は止めずにいまのやり取りに足す） */
  busy: boolean;
  /** 次に送る指示で、作業は終わり、書き直しが終わるのを待っている（保存・やめると送る。ボタンの説明に添える。案内は見出しに 1 か所だけ出す） */
  ready?: boolean;
  text: string;
  /** 残しておく添付（外したものは除いたもの） */
  attachments: Attachment[];
  onChange: (text: string) => void;
  onAttachmentsChange: (attachments: Attachment[]) => void;
  /** 保存する添付（残したもの ＋ 足してアップロードできたもの） */
  onSave: (attachments: Attachment[]) => void;
  /** 保存して、いま送る（⌘Enter） */
  onSaveAndSend: (attachments: Attachment[]) => void;
  onCancel: () => void;
}) {
  const files = useComposerFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  // アップロードの途中は保存しない（足した添付が抜け落ちないように）
  const save = (send = false) => {
    if (files.uploading) return;
    const all = [...attachments, ...files.attachments];
    if (send) onSaveAndSend(all);
    else onSave(all);
  };
  // ⌘ を押している間（⌘Enter で「保存していま送る」になることを、そのボタンを光らせて示す）
  const [held, setHeld] = useState(false);
  useWindowEvent("keyup", (e) => {
    if (!e.metaKey) setHeld(false);
  });
  useWindowEvent("blur", () => setHeld(false));
  const sendLabel = busy ? "保存していま送る（止めずに、いまのやり取りに足す）" : "保存していま送る";
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    setHeld(e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      // ⌘Enter は保存していま送る（チャット欄の ⌘Enter =「いま」と同じ）
      save(e.metaKey);
    }
  };
  const hasAttachments = attachments.length > 0 || files.files.length > 0;
  return (
    <div className={cx("queued-row editing", files.dragging && "file-over")} data-id={id} {...files.dropProps}>
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
        title={files.uploading ? "アップロードが終わるまでお待ちください" : ready ? "保存して送る（Enter）" : "保存（Enter）"}
        size={13}
        disabled={files.uploading}
        onClick={() => save()}
      />
      <IconButton
        icon={SendHorizontal}
        label={sendLabel}
        title={files.uploading ? "アップロードが終わるまでお待ちください" : `${sendLabel}（⌘Enter）`}
        size={13}
        className={cx("queued-editor-send", held && "held")}
        disabled={files.uploading}
        onClick={() => save(true)}
      />
      <IconButton icon={X} label="やめる" title={ready ? "やめる（Esc。元の文のまま送ります）" : "やめる（Esc）"} size={13} onClick={onCancel} />
    </div>
  );
}
