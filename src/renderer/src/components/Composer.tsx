import { useState, type KeyboardEvent } from "react";
import { RunOptionsBar, type RunOptionsState } from "./RunOptionsBar";

interface Props {
  options: RunOptionsState;
  placeholder?: string;
  busy?: boolean;
  onSend: (text: string) => Promise<void>;
  onStop?: () => void;
}

/** チャットの入力欄（⌘+Enter で送信） */
export function Composer({ options, placeholder, busy, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  async function send() {
    const value = text.trim();
    if (!value || sending || busy) return;
    setSending(true);
    setError(undefined);
    try {
      await onSend(value);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="composer">
      <textarea
        rows={3}
        value={text}
        placeholder={placeholder ?? (busy ? "エージェントが作業中です…" : "メッセージを入力（⌘+Enter で送信）")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-bar">
        <RunOptionsBar state={options} />
        {busy && onStop ? (
          <button className="send-button stop" title="中断" aria-label="中断" onClick={onStop}>
            ■
          </button>
        ) : (
          <button
            className="send-button"
            title="送信（⌘+Enter）"
            aria-label="送信"
            disabled={!text.trim() || sending || busy}
            onClick={() => void send()}
          >
            ↑
          </button>
        )}
      </div>
      {error && <p className="error small composer-error">{error}</p>}
    </div>
  );
}
