import "./ReplyField.css";
import type { TextareaHTMLAttributes } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { AttachButton, MessageField, PendingFileChips, type MessageFieldState, type useDraftFiles } from "@/features/composer/ui";

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onKeyDown" | "onKeyUp" | "onBlur" | "onSelect" | "className">;

/**
 * 承認・質問のカードで答えを書く欄（質問の「その他」・拒否の理由で共通）: チャット欄と同じく書いた分だけ伸びる複数行の欄と、
 * 添付（📎・貼り付け・ドラッグ＆ドロップ）の札、マイク。キーと音声は呼ぶ側の useMessageField、添付は useDraftFiles を渡す。
 * onAttach: 添付を足し始めたとき（貼り付け・📎。質問の「その他」は、そこで「その他」を選ぶ）
 */
export function ReplyField({
  field,
  files,
  className,
  onAttach,
  ...textarea
}: TextareaProps & { field: MessageFieldState; files: ReturnType<typeof useDraftFiles>; className?: string; onAttach?: () => void }) {
  return (
    <>
      <div className={cx("reply-field", className, files.dragging && "file-over")} {...files.dropProps}>
        {files.files.length > 0 && (
          <div className="composer-attachments reply-field-attachments">
            <PendingFileChips files={files.files} onRemove={files.removeFile} />
          </div>
        )}
        <div className="reply-field-input">
          <MessageField
            field={field}
            {...textarea}
            onPaste={(e) => {
              onAttach?.();
              files.onPaste(e);
            }}
          />
          <AttachButton onOpen={onAttach} onFiles={files.addFiles} />
          {field.voice.button}
        </div>
      </div>
      {field.voice.error}
    </>
  );
}
