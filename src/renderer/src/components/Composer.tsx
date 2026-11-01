import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Attachment } from "../../../core/types";
import { api } from "../api";
import { errorMessage } from "../errors";
import { AttachmentChip } from "./AttachmentChip";
import { ErrorText } from "./ErrorText";
import { IconButton } from "./IconButton";
import { RunOptionsBar, type RunOptionsState } from "./RunOptionsBar";

interface Props {
  options: RunOptionsState;
  placeholder?: string;
  /** 入力欄にあらかじめ入れておく文 */
  initialText?: string;
  autoFocus?: boolean;
  busy?: boolean;
  /** モデル選択の前に置く追加の選択（新しいチャットのセクションなど） */
  leading?: ReactNode;
  /** 送信ボタンの左に置くもの（コンテキストウィンドウのメーターなど） */
  trailing?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onStop?: () => void;
}

interface PendingFile {
  key: string;
  file: File;
  previewUrl?: string;
  attachment?: Attachment;
  error?: string;
}

/** チャットの入力欄（Enter で送信・Shift+Enter で改行。📎・ドラッグ＆ドロップ・貼り付けでファイルを添付） */
export function Composer({ options, placeholder, initialText, autoFocus, busy, leading, trailing, onSend, onStop }: Props) {
  const [text, setText] = useState(initialText ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  // 画像のプレビュー用 URL は不要になったら解放する
  useEffect(() => () => files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = `${Date.now()}-${Math.random()}`;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setFiles((prev) => [...prev, { key, file, previewUrl }]);
      // 選んだ時点でアップロードしておき、送信を待たせない
      api
        .upload(file)
        .then((attachment) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, attachment } : f))))
        .catch((e: unknown) =>
          setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, error: errorMessage(e) } : f))),
        );
    }
  }

  function removeFile(key: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.key !== key);
    });
  }

  const uploading = files.some((f) => !f.attachment && !f.error);
  const canSend = (text.trim() || files.some((f) => f.attachment)) && !uploading && !sending && !busy;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(undefined);
    try {
      await onSend(
        text.trim(),
        files.flatMap((f) => (f.attachment ? [f.attachment] : [])),
      );
      setText("");
      files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      setFiles([]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter で送信、Shift+Enter で改行。日本語入力の変換を確定する Enter では送らない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void send();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`composer ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {files.length > 0 && (
        <div className="composer-attachments">
          {files.map((f) => (
            <span key={f.key} className="composer-attachment">
              <AttachmentChip
                attachment={{ name: f.file.name, mime: f.file.type, size: f.file.size }}
                previewUrl={f.previewUrl}
                uploading={!f.attachment && !f.error}
                onRemove={() => removeFile(f.key)}
              />
              {f.error && <span className="error small">{f.error}</span>}
            </span>
          ))}
        </div>
      )}
      <textarea
        rows={3}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? (busy ? "エージェントが作業中です…" : "メッセージを入力（Enter で送信、Shift+Enter で改行）")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <div className="composer-bar">
        <div className="composer-tools">
          <IconButton
            icon={Paperclip}
            label="ファイルを添付"
            title="ファイルを添付（ドラッグ＆ドロップ・貼り付けでも可）"
            size={16}
            className="attach-button"
            type="button"
            onClick={() => inputRef.current?.click()}
          />
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {leading}
          <RunOptionsBar state={options} />
        </div>
        <div className="composer-actions">
        {trailing}
        {busy && onStop ? (
          <button className="send-button stop" title="中断" aria-label="中断" onClick={onStop}>
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button className="send-button" title="送信（Enter）" aria-label="送信" disabled={!canSend} onClick={() => void send()}>
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        )}
        </div>
      </div>
      {dragging && <div className="drop-hint">ここにドロップして添付</div>}
      <ErrorText message={error} className="composer-error" />
    </div>
  );
}
