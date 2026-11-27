import "./ApprovalDenyForm.css";
import { useState } from "react";
import type { Attachment } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { AttachButton, MessageField, PendingFileChips, PLAIN_SUBMIT, useDraftFiles, useMessageField } from "@/features/composer/ui";
import { denyFormModel } from "./denyFormModel";

/**
 * 承認の拒否の欄: 理由（任意）をチャット欄と同じく書いた分だけ伸びる複数行の欄で書き（Enter で拒否・Shift+Enter で改行・Esc で戻る）、
 * 画像などを添付（📎・貼り付け・ドラッグ＆ドロップ）し、マイクで音声入力できる。理由も添付もなければ「理由なしで拒否」になる。
 * 添付はコアが理由の文にパスを書き添えて AI に渡し、AI は Read ツールで読む（質問の「その他」と同じ）
 */
export function ApprovalDenyForm({ sending, onBack, onDeny }: { sending: boolean; onBack: () => void; onDeny: (reason: { message?: string; attachments?: Attachment[] }) => void }) {
  const [message, setMessage] = useState("");
  const files = useDraftFiles();
  const model = denyFormModel({ message, attachments: files.attachments, uploading: files.uploading });
  const deny = () => {
    if (sending || !model.canDeny) return;
    onDeny(model.reason);
  };
  const field = useMessageField({ value: message, onChange: setMessage, onSubmit: deny, onCancel: onBack, focusEnd: true });
  return (
    <div className="approval-deny">
      <div className={cx("approval-deny-field", files.dragging && "file-over")} {...files.dropProps}>
        {files.files.length > 0 && (
          <div className="composer-attachments approval-deny-attachments">
            <PendingFileChips files={files.files} onRemove={files.removeFile} />
          </div>
        )}
        <div className="approval-deny-input">
          <MessageField
            field={field}
            rows={2}
            placeholder="拒否の理由や、代わりにしてほしいこと（任意）"
            aria-label="拒否の理由"
            title="Enter で拒否・Shift+Enter で改行・Esc で戻る。画像は貼り付け・ドラッグ・📎 で添付できます。マイクか ⌘⇧Space で音声入力"
            onPaste={files.onPaste}
          />
          <AttachButton onFiles={files.addFiles} />
          {field.voice.button}
        </div>
      </div>
      {field.voice.error}
      <div className="approval-deny-actions">
        <span className="approval-deny-hint muted small">Enter で拒否・Shift+Enter で改行・Esc で戻る</span>
        <button type="button" className="btn" disabled={sending} onClick={onBack}>
          戻る
        </button>
        <button type="button" className="btn btn-danger" disabled={sending || !model.canDeny} title={model.title} onClick={() => field.submit(PLAIN_SUBMIT)}>
          {model.label}
        </button>
      </div>
    </div>
  );
}
