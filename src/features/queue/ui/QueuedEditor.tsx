import "./QueuedRow.css";
import { Check, SendHorizontal, X } from "lucide-react";
import type { Attachment } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { AttachmentChips } from "@/features/attachments/ui";
import { AttachButton, MessageField, PendingFileChips, PLAIN_SUBMIT, useDraftFiles, useMessageField } from "@/features/composer/ui";

/**
 * 送信待ちの指示を書き直す欄（Enter で保存・⌘Enter で保存していま送る（チャット欄の「いま」と同じ。作業中なら止めずにいまのやり取りに足す）・
 * Shift+Enter で改行・Esc でやめる）。⌘ を押している間は、⌘Enter で使われる「保存していま送る」のボタンを青く光らせる（チャット欄と同じ）。
 * 添付は上にすべて並べ、× で外せる。📎・貼り付け・ドラッグ＆ドロップで足せる（チャット欄と同じく、選んだ時点でアップロードする）。
 * 音声入力もチャット欄と同じマイク（キャレットの位置に入れる。録音中の Enter は入れて保存・⌘Enter は入れて保存していま送る・⌘⇧Space で開始・停止・Esc でやめる）。
 * ボタン（マイク・📎・保存・保存していま送る・やめる）は入力欄の右に並べ、入力欄が縦に伸びたら上にそろえる。保存と送るは名前の書き直し（InlineName）・チャット欄と同じく緑
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
  const files = useDraftFiles();
  // アップロードの途中は保存しない（足した添付が抜け落ちないように）
  const save = (send = false) => {
    if (files.uploading) return;
    const all = [...attachments, ...files.attachments];
    if (send) onSaveAndSend(all);
    else onSave(all);
  };
  // Enter で保存・⌘Enter で保存していま送る（チャット欄の ⌘Enter =「いま」と同じ）・Esc でやめる。
  // ⌘ を押している間は、⌘Enter で使われる「保存していま送る」のボタンを光らせる
  // 開いたら文の終わりから書き始める
  const field = useMessageField({ value: text, onChange, onSubmit: ({ meta }) => save(meta), onCancel, focusEnd: true });
  const sendLabel = busy ? "保存していま送る（止めずに、いまのやり取りに足す）" : "保存していま送る";
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
            <AttachmentChips attachments={attachments} onRemove={(a) => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))} />
            <PendingFileChips files={files.files} onRemove={files.removeFile} />
          </div>
        )}
        {/* 入力欄の右にボタンを並べる（添付があっても入力欄の横。入力欄が縦に伸びたら上にそろえる） */}
        <div className="queued-editor-line">
          <MessageField
            field={field}
            className="queued-editor"
            // 高さは文に合わせる（折り返した行も含めて全部見せる。CSS の field-sizing）
            rows={1}
            aria-label="待ちの指示を書き直す"
            onPaste={files.onPaste}
          />
          <div className="queued-editor-actions">
            {field.voice.button}
            <AttachButton iconSize={13} onFiles={files.addFiles} />
            <IconButton
              icon={Check}
              label="保存"
              title={files.uploading ? "アップロードが終わるまでお待ちください" : ready ? "保存して送る（Enter）" : "保存（Enter）"}
              iconSize={13}
              className="queued-editor-ok"
              disabled={files.uploading}
              // 録音中なら、止めて起こした文を入れてから保存する
              onClick={() => field.submit(PLAIN_SUBMIT)}
            />
            <IconButton
              icon={SendHorizontal}
              label={sendLabel}
              title={files.uploading ? "アップロードが終わるまでお待ちください" : `${sendLabel}（⌘Enter）`}
              iconSize={13}
              className={cx("queued-editor-send", field.held.held === "meta" && "held")}
              disabled={files.uploading}
              onClick={() => field.submit({ meta: true, shift: false })}
            />
            <IconButton icon={X} label="やめる" title={ready ? "やめる（Esc。元の文のまま送ります）" : "やめる（Esc）"} iconSize={13} onClick={onCancel} />
          </div>
        </div>
        {field.voice.error}
      </div>
    </div>
  );
}
