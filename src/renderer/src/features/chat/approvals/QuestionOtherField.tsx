import { useEffect, useRef, type KeyboardEvent } from "react";
import { useEditKeys } from "@/hooks/useEditKeys";
import type { Attachment } from "@shared/types";
import { cx } from "@/lib/cx";
import { consumeKey, hasModifiers, isCancelKey, isSubmitKey } from "@/lib/keys";
import { DictationButton, DictationError } from "@/features/dictation/DictationButton";
import { insertDictation } from "@/features/dictation/dictationText";
import { useDictation } from "@/features/dictation/useDictation";
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
  const files = useComposerFiles();
  // 添付が変わったら知らせる（ID の並びとアップロードの途中かで比べ、描き直しのたびには知らせない）
  const key = `${files.attachments.map((a) => a.id).join(",")}|${files.uploading}`;
  useEffect(() => onFiles({ attachments: files.attachments, uploading: files.uploading }), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter で回答する（変換中の Enter は確定に使い、送らない）・Shift+Enter で改行
  const keys = useEditKeys({ onSubmit });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 音声入力で「入れてそのまま回答」したとき、入れた文が回答に入ってから（描き直したあとで）回答する
  const submitAfterInsert = useRef(false);
  useEffect(() => {
    if (!submitAfterInsert.current) return;
    submitAfterInsert.current = false;
    onSubmit();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  // 音声入力: 起こした文をキャレットの位置（選んでいればその範囲）に入れ、「その他」を選ぶ（send なら入れてそのまま回答）
  const dictation = useDictation({
    onText: (spoken, send) => {
      const el = textareaRef.current;
      const current = el?.value ?? value;
      const inserted = insertDictation(current, el?.selectionStart ?? current.length, el?.selectionEnd ?? current.length, spoken);
      onFocus();
      onChange(inserted.text);
      if (send) submitAfterInsert.current = true;
      else
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(inserted.caret, inserted.caret);
        });
    },
  });
  /** 欄のキー: 録音中の Enter は入れてそのまま回答・⌘⇧Space で録音の開始・停止・録音中の Esc でやめる。ほかは Enter で回答・Shift+Enter で改行 */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (dictation.recording && isSubmitKey(e)) {
      e.preventDefault();
      void dictation.finish(true);
    } else if (e.code === "Space" && hasModifiers(e, { meta: true, shift: true })) {
      e.preventDefault();
      dictation.toggle();
    } else if (isCancelKey(e) && (dictation.recording || dictation.state.kind === "transcribing")) {
      consumeKey(e);
      dictation.cancel();
    } else keys.keyProps.onKeyDown(e);
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
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="その他の回答"
          aria-label="その他の回答"
          title="Enter で回答・Shift+Enter で改行。画像は貼り付け・ドラッグ・📎 で添付できます。マイクか ⌘⇧Space で音声入力"
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          {...keys.keyProps}
          onKeyDown={onKeyDown}
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
