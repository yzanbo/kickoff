import { useEffect, useEffectEvent, useRef } from "react";
import { useEditKeys } from "@/foundation/ui/hooks/useEditKeys";
import type { OtherFiles } from "./questionAnswers";
import { cx } from "@/foundation/ui/lib/cx";
import { DictationButton, DictationError } from "@/features/voice/ui/DictationButton";
import { useFieldDictation } from "@/features/voice/ui/useFieldDictation";
import { AttachButton } from "@/features/composer/ui/AttachButton";
import { PendingFileChips } from "@/features/composer/ui/PendingFileChips";
import { useDraftFiles } from "@/features/composer/ui/useDraftFiles";


/**
 * AI からの質問の「その他」の欄: チャット欄と同じく、書いた分だけ伸びる複数行の欄（Enter で回答・Shift+Enter で改行）と、
 * 画像などの添付（📎・貼り付け・ドラッグ＆ドロップ）。添付はコアが回答の文にパスを書き添えて渡し、AI は Read ツールで読む。
 * 音声入力もチャット欄と同じマイク（useDictation。1 回押して話し、もう一度押すとキャレットの位置に入れる。録音中の Enter は入れてそのまま回答・
 * 欄の中の ⌘⇧Space で開始・停止・Esc でやめる）。入れたら「その他」を選ぶ
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
  const files = useDraftFiles();
  // 添付が変わったら知らせる（ID の並びとアップロードの途中かで比べ、描き直しのたびには知らせない）
  const key = `${files.attachments.map((a) => a.id).join(",")}|${files.uploading}`;
  const reportFiles = useEffectEvent(() => onFiles({ attachments: files.attachments, uploading: files.uploading }));
  useEffect(() => reportFiles(), [key]);

  // Enter で回答する（変換中の Enter は確定に使い、送らない）・Shift+Enter で改行
  const keys = useEditKeys({ onSubmit });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 音声入力: 起こした文をキャレットの位置に入れ、「その他」を選ぶ（録音中の Enter は入れてそのまま回答・⌘⇧Space で開始・停止・Esc でやめる）
  const { dictation, handleKey } = useFieldDictation({ textareaRef, value, onChange, onSubmit: () => onSubmit(), onInsert: onFocus });
  return (
    <div className={cx("question-other-field", files.dragging && "file-over")} {...files.dropProps}>
      {files.files.length > 0 && (
        <div className="composer-attachments question-other-attachments">
          <PendingFileChips files={files.files} onRemove={files.removeFile} />
        </div>
      )}
      <div className="question-other-input">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="その他の回答"
          aria-label="その他の回答"
          title="Enter で回答・Shift+Enter で改行。画像は貼り付け・ドラッグ・📎 で添付できます。マイクか ⌘⇧Space で音声入力"
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          {...keys.keyProps}
          onKeyDown={(e) => handleKey(e) || keys.keyProps.onKeyDown(e)}
          onPaste={(e) => {
            onFocus();
            files.onPaste(e);
          }}
        />
        {/* 押したら「その他」を選ぶ（選ばないと添付が回答に入らない） */}
        <AttachButton onOpen={onFocus} onFiles={files.addFiles} />
        <DictationButton dictation={dictation} />
      </div>
      <DictationError dictation={dictation} />
    </div>
  );
}
