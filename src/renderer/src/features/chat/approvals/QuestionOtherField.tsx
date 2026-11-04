import { useEffect } from "react";
import { useEditKeys } from "@/hooks/useEditKeys";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { AttachButton } from "@/features/chat/attachments/AttachButton";
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
  // 添付が変わったら知らせる（ID の並びとアップロードの途中かで比べ、描き直しのたびには知らせない）
  const key = `${files.attachments.map((a) => a.id).join(",")}|${files.uploading}`;
  useEffect(() => onFiles({ attachments: files.attachments, uploading: files.uploading }), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter で回答する（変換中の Enter は確定に使い、送らない）・Shift+Enter で改行
  const keys = useEditKeys({ onSubmit });
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
          {...keys.keyProps}
          onPaste={(e) => {
            onFocus();
            files.onPaste(e);
          }}
        />
        {/* 押したら「その他」を選ぶ（選ばないと添付が回答に入らない） */}
        <AttachButton onOpen={onFocus} onFiles={files.addFiles} />
      </div>
    </div>
  );
}
