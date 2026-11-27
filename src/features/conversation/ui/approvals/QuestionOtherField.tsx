import "./QuestionOtherField.css";
import { useEffect, useEffectEvent } from "react";
import type { OtherFiles } from "./questionAnswers";
import { useDraftFiles, useMessageField } from "@/features/composer/ui";
import { ReplyField } from "./ReplyField";

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

  // Enter で回答する（変換中の Enter は確定に使い、送らない）・Shift+Enter で改行。
  // 音声入力: 起こした文をキャレットの位置に入れ、「その他」を選ぶ（録音中の Enter は入れてそのまま回答・⌘⇧Space で開始・停止・Esc でやめる）
  const field = useMessageField({ value, onChange, onSubmit: () => onSubmit(), onVoiceInsert: onFocus });
  return (
    <div className="question-other-field">
      <ReplyField
        field={field}
        files={files}
        // 貼り付け・📎 でも「その他」を選ぶ（選ばないと添付が回答に入らない）
        onAttach={onFocus}
        rows={1}
        placeholder="その他の回答"
        aria-label="その他の回答"
        title="Enter で回答・Shift+Enter で改行。画像は貼り付け・ドラッグ・📎 で添付できます。マイクか ⌘⇧Space で音声入力"
        onFocus={onFocus}
      />
    </div>
  );
}
