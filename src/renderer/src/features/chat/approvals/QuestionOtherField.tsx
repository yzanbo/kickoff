import { Paperclip } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";
import { PendingFileChips } from "@/features/chat/attachments/PendingFileChips";
import { useComposerFiles } from "@/features/chat/attachments/useComposerFiles";

/** 「その他」に添えた添付の様子（回答するときに使う。アップロードの途中は回答させない） */
export interface OtherFiles {
  attachments: Attachment[];
  uploading: boolean;
}

/**
 * AI からの質問の「その他」の欄: チャット欄と同じく、書いた分だけ伸びる複数行の欄（Enter で回答・Shift+Enter で改行）と、
 * 画像などの添付（📎・貼り付け・ドラッグ＆ドロップ）。添付はコアが回答の文にパスを書き添えて渡し、AI は Read ツールで読む
 */
export function QuestionOtherField({
  value,
  onChange,
  onFocus,
  onFiles,
  onSubmit,
}: {
  value: string;
  onChange: (text: string) => void;
  /** 欄に入ったら「その他」を選ぶ */
  onFocus: () => void;
  onFiles: (files: OtherFiles) => void;
  /** Enter で回答する（回答できないときは何もしない） */
  onSubmit: () => void;
}) {
  const files = useComposerFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  // 添付が変わったら知らせる（ID の並びとアップロードの途中かで比べ、描き直しのたびには知らせない）
  const key = `${files.attachments.map((a) => a.id).join(",")}|${files.uploading}`;
  useEffect(() => onFiles({ attachments: files.attachments, uploading: files.uploading }), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 変換中の Enter は確定に使う（送らない）
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    onSubmit();
  };
  return (
    <div className={cx("question-other-field", files.dragging && "file-over")} {...files.dropProps}>
      {files.files.length > 0 && (
        <div className="composer-attachments question-other-attachments">
          <PendingFileChips files={files.files} onRemove={files.removeFile} />
        </div>
      )}
      <div className="question-other-input">
        <textarea
          rows={1}
          value={value}
          placeholder="その他の回答"
          aria-label="その他の回答"
          title="Enter で回答・Shift+Enter で改行。画像は貼り付け・ドラッグ・📎 で添付できます"
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            onFocus();
            files.onPaste(e);
          }}
        />
        <IconButton
          icon={Paperclip}
          label="ファイルを添付"
          title="画像・ファイルを添付（貼り付け・ドラッグ＆ドロップでも）"
          size={14}
          onClick={() => {
            onFocus();
            inputRef.current?.click();
          }}
        />
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
      </div>
    </div>
  );
}
