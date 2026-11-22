import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { MessageField, useMessageField } from "@/features/composer/ui";

/** 吹き出しの中の書き直しの欄（Enter で送り直す・Shift+Enter で改行・Esc でやめる）。onSend は確かめてやめたら false */
export function BubbleEditor({
  text,
  onChange,
  onCancel,
  onSend,
}: {
  text: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSend: () => Promise<boolean>;
}) {
  // 送り直している間と、送れなかった理由
  const action = useAction<"send">();
  const sending = action.busy !== null;
  const send = async () => {
    if (!text.trim() || sending) return;
    await action.run("send", async () => {
      if (await onSend()) onCancel();
    });
  };
  // 開いたら文の終わりから書き始める（音声入力はない）
  const field = useMessageField({ value: text, onChange, onSubmit: () => void send(), onCancel, voice: false, focusEnd: true });
  return (
    <div className="bubble-editor">
      <MessageField field={field} rows={Math.min(12, Math.max(2, text.split("\n").length))} aria-label="発言を書き直す" />
      <ErrorText message={action.error} />
      <div className="bubble-editor-actions">
        <button type="button" className="btn" data-size="sm" disabled={sending} onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="btn btn-primary" data-size="sm" disabled={sending || !text.trim()} onClick={() => void send()}>
          {sending ? "送信中…" : "送り直す"}
        </button>
      </div>
    </div>
  );
}
