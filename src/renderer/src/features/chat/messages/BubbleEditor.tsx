import { useAction } from "@/hooks/useAction";
import { useEditKeys } from "@/hooks/useEditKeys";
import { ErrorText } from "@/ui/ErrorText";

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
  const keys = useEditKeys({ onSubmit: () => void send(), onCancel });
  return (
    <div className="bubble-editor">
      <textarea
        value={text}
        rows={Math.min(12, Math.max(2, text.split("\n").length))}
        aria-label="発言を書き直す"
        // 開いたら文の終わりから書き始める
        ref={(el) => {
          if (el && !el.dataset.ready) {
            el.dataset.ready = "1";
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        {...keys.keyProps}
      />
      <ErrorText message={action.error} />
      <div className="bubble-editor-actions">
        <button type="button" className="btn btn-sm" disabled={sending} onClick={onCancel}>
          やめる
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={sending || !text.trim()} onClick={() => void send()}>
          {sending ? "送信中…" : "送り直す"}
        </button>
      </div>
    </div>
  );
}
