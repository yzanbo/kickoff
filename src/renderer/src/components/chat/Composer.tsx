import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Attachment } from "../../../../core/types";
import { api, type GitTarget } from "../../api";
import { errorMessage } from "../../errors";
import { AttachmentChip } from "./AttachmentChip";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { RunOptionsBar, type RunOptionsState } from "./RunOptionsBar";
import { SuggestList } from "../suggest/SuggestList";
import { useSuggest } from "../suggest/useSuggest";

interface Props {
  options: RunOptionsState;
  placeholder?: string;
  autoFocus?: boolean;
  busy?: boolean;
  /** 送信ボタンの左に置くもの（コンテキストウィンドウのメーターなど） */
  trailing?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onStop?: () => void;
  /** 作業中だけ、送信ボタンの左に出すもの（送り方の切り替えなど） */
  busyControls?: ReactNode;
  /** 作業中に送ったとき（待ちの列に入れる。渡さなければ、作業中は送れない） */
  onQueue?: (text: string, attachments: Attachment[]) => Promise<void>;
  /** 書いている文が変わったとき（少し待ってから知らせる。新しいチャットの下書きのカードに出すため） */
  onTextChange?: (text: string) => void;
  /** / と @ の候補を出す作業場所（コマンド・ファイルをここから探す） */
  suggestTarget?: GitTarget;
}

/** 入力欄を伸ばす上限（px。これを超えたら中でスクロールする） */
const COMPOSER_MAX_HEIGHT = 240;

/** 書いている文を知らせるまで待つ時間（打つたびに知らせない） */
const TEXT_CHANGE_DELAY_MS = 300;

interface PendingFile {
  key: string;
  file: File;
  previewUrl?: string;
  attachment?: Attachment;
  error?: string;
}

/** チャットの入力欄（Enter で送信・Shift+Enter で改行。📎・ドラッグ＆ドロップ・貼り付けでファイルを添付） */
/** onSend で投げると、送るのをやめたことになる（書いた文は残し、失敗の文も出さない。確かめのダイアログでやめたときなど） */
export class SendCancelled extends Error {}

export function Composer({ options, placeholder, autoFocus, busy, trailing, onSend, onStop, onQueue, busyControls, onTextChange, suggestTarget }: Props) {
  // 新しいチャットも含め、入力欄は空から始める（あらかじめ文を入れない）
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // / と @ の候補（Claude Code の VS Code 拡張と同じ）
  const suggest = useSuggest({ target: suggestTarget, text, setText, textareaRef });
  const textChange = useRef(onTextChange);
  textChange.current = onTextChange;
  useEffect(() => {
    if (!textChange.current) return;
    const timer = setTimeout(() => textChange.current?.(text), TEXT_CHANGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // 書いた分だけ高さを伸ばす（空なら 1 行。上限を超えたら中でスクロール）
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [text]);
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
  // 作業中は、待ちの列に入れられるときだけ送れる
  const queueing = Boolean(busy && onQueue);
  const hasContent = Boolean(text.trim() || files.some((f) => f.attachment));
  const canSend = hasContent && !uploading && !sending && (!busy || queueing);

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(undefined);
    try {
      await (queueing ? onQueue! : onSend)(
        text.trim(),
        files.flatMap((f) => (f.attachment ? [f.attachment] : [])),
      );
      setText("");
      files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      setFiles([]);
    } catch (e) {
      if (!(e instanceof SendCancelled)) setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 候補を出している間は、↑↓・Enter・Tab・Esc を候補の操作に使う
    if (suggest.handleKey(e)) return;
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
      <SuggestList suggest={suggest} />
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onSelect={(e) => suggest.onCaret(e.currentTarget.selectionStart)}
        autoFocus={autoFocus}
        placeholder={placeholder ?? (busy ? "エージェントが作業中です…" : "メッセージを入力（Enter で送信、Shift+Enter で改行）")}
        onChange={(e) => {
          setText(e.target.value);
          suggest.onCaret(e.target.selectionStart);
        }}
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
          <RunOptionsBar state={options} />
        </div>
        <div className="composer-actions">
        {trailing}
        {busy && busyControls}
        {/* 作業中は中断。書いていれば、その横に待ちの列に入れるボタン */}
        {busy && onStop && (
          <button className="send-button stop" title="中断" aria-label="中断" onClick={onStop}>
            <Square size={12} fill="currentColor" />
          </button>
        )}
        {(!busy || !onStop || (queueing && hasContent)) && (
          <button
            className="send-button"
            title={queueing ? "待ちの列に入れる（Enter）。いまの作業が終わったら送ります" : "送信（Enter）"}
            aria-label={queueing ? "待ちの列に入れる" : "送信"}
            disabled={!canSend}
            onClick={() => void send()}
          >
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
