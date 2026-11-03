import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import type { Attachment } from "../../../../core/types";
import type { GitTarget } from "../../api";
import { errorMessage } from "../../errors";
import { cx } from "../../cx";
import { useSharedFlag, useStoredText } from "../../hooks/useStoredState";
import { COMPOSER_COMPACT_KEY } from "../../storageKeys";
import { PendingFileChips } from "./PendingFileChips";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { DictationButton, DictationError } from "../dictation/DictationButton";
import { insertDictation } from "../dictation/dictationText";
import { useDictation } from "../dictation/useDictation";
import { RunOptionsBar, type RunOptionsState } from "./RunOptionsBar";
import { SuggestList } from "../suggest/SuggestList";
import { useSuggest } from "../suggest/useSuggest";
import { useComposerFiles } from "./useComposerFiles";
import { usePromptHistory } from "./usePromptHistory";

interface Props {
  /** モデル・推論の深さ・権限モードの選択（なければ出さない。サブエージェントのタブなど） */
  options?: RunOptionsState;
  placeholder?: string;
  autoFocus?: boolean;
  busy?: boolean;
  /** 送信ボタンの左に置くもの（コンテキストウィンドウのメーターなど） */
  trailing?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onStop?: () => void;
  /** 作業中だけ、送信ボタンの左に出すもの（送り方の切り替えなど） */
  busyControls?: ReactNode;
  /**
   * 作業中に送ったとき（渡さなければ、作業中は送れない）。mode はキーで決めたとき（⌘Enter = 伝える・⌘⇧Enter = ためておく）。
   * なければ、チャット欄の切り替えのとおり
   */
  onQueue?: (text: string, attachments: Attachment[], mode?: QueueSendMode) => Promise<void>;
  /** 書いている文が変わったとき（少し待ってから知らせる。新しいチャットの下書きのカードに出すため） */
  onTextChange?: (text: string) => void;
  /** / と @ の候補を出す作業場所（コマンド・ファイルをここから探す） */
  suggestTarget?: GitTarget;
  /** ↑↓ で呼び出す、このチャットで前に送った自分の発言（新しい順。新しいチャットの入力欄では渡さない） */
  history?: string[];
  /** 書きかけの文を残す localStorage のキー（既存のチャットの chatDraftKey。新しいチャットはタブの draftText で残すので渡さない） */
  draftKey?: string;
  /** 外から入力欄に文を入れる口（発言の一覧の「入力欄に入れる」など。入れたら文の終わりにピントを置く） */
  fillRef?: MutableRefObject<((text: string) => void) | null>;
}

/** 入力欄を伸ばす上限（px。これを超えたら中でスクロールする） */
const COMPOSER_MAX_HEIGHT = 240;

/** 書いている文を知らせるまで待つ時間（打つたびに知らせない） */
const TEXT_CHANGE_DELAY_MS = 300;

/** 作業中に送るときの扱い（伝える = 止めずに、いまのやり取りに足す / ためておく = 終わったら送る） */
export type QueueSendMode = "tell" | "queue";

/** 作業中の送り方をキーで決める: ⌘⇧Enter = ためておく、⌘Enter = 伝える（どちらでもなければ、チャット欄の切り替えのとおり） */
const sendModeOf = (e: KeyboardEvent): QueueSendMode | undefined => (e.metaKey ? (e.shiftKey ? "queue" : "tell") : undefined);

/** 送信の Enter か（Shift+Enter は改行。⌘⇧Enter は送り方を決めた送信。日本語入力の変換を確定する Enter は除く） */
const isSendEnter = (e: KeyboardEvent) => e.key === "Enter" && (!e.shiftKey || e.metaKey) && !e.nativeEvent.isComposing && e.keyCode !== 229;

/** onSend で投げると、送るのをやめたことになる（書いた文は残し、失敗の文も出さない。確かめのダイアログでやめたときなど） */
export class SendCancelled extends Error {}

/**
 * チャットの入力欄（Enter で送信・Shift+Enter で改行。📎・ドラッグ＆ドロップ・貼り付けでファイルを添付。
 * マイクで音声入力（⌘⇧Space でも始め・止める。録音中に送ると、起こした文を入れてそのまま送る。Esc でやめる））
 */
export function Composer({ options, placeholder, autoFocus, busy, trailing, onSend, onStop, onQueue, busyControls, onTextChange, suggestTarget, history, draftKey, fillRef }: Props) {
  // 新しいチャットも含め、入力欄は空から始める（あらかじめ文を入れない）。
  // 既存のチャットだけは、自分が書きかけていた文を戻す（送った・空にしたら消える）
  const [text, setText] = useStoredText(draftKey);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 文を入れて、キャレットを caret に置く（描き直して高さが合ってから） */
  const fill = (value: string, caret = value.length) => {
    setText(value);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };
  if (fillRef) fillRef.current = (value: string) => fill(value);
  // コンパクト表示（文字・余白・下の道具を小さくする。設定の「表示」で切り替え、どのチャット欄にもすぐ効く）
  const [compact] = useSharedFlag(COMPOSER_COMPACT_KEY);
  // ↑↓ で前の発言を呼び出す
  const promptHistory = usePromptHistory({ prompts: history, text, setText, textareaRef });
  // / と @ の候補（Claude Code の VS Code 拡張と同じ）。呼び出した発言を出している間は出さない
  const suggest = useSuggest({ target: suggestTarget, text, setText, textareaRef, paused: promptHistory.recalled });
  const textChange = useRef(onTextChange);
  textChange.current = onTextChange;
  useEffect(() => {
    if (!textChange.current) return;
    const timer = setTimeout(() => textChange.current?.(text), TEXT_CHANGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // 書いた分だけ高さを伸ばす（空なら 1 行。上限を超えたら中でスクロール）。
  // 文が変わったときに加えて、幅が変わったときも測り直す（パネルを開く途中など、狭い瞬間に測った高さが残って縦長にならないように）
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, compact]);
  const attach = useComposerFiles();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  // 音声入力: 起こした文をキャレットの位置（選んでいればその範囲）に入れる。send なら、入れてそのまま送る
  const dictation = useDictation({
    onText: (spoken, sendNow) => {
      const el = textareaRef.current;
      const value = el?.value ?? text;
      const inserted = insertDictation(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, spoken);
      if (sendNow) {
        setText(inserted.text);
        void send(inserted.text);
      } else {
        fill(inserted.text, inserted.caret);
      }
    },
  });

  // 作業中は、待ちの列に入れられるときだけ送れる
  const queueing = Boolean(busy && onQueue);
  const hasContent = Boolean(text.trim() || attach.attachments.length > 0);
  const ready = !attach.uploading && !sending && (!busy || queueing);
  // 録音中は、送信で「起こした文を入れてそのまま送る」
  const canSend = (hasContent || dictation.recording) && ready;

  /** 送る（body を渡せば、いまの文の代わりにそれを送る。音声入力で入れてそのまま送るとき。mode は作業中の送り方をキーで決めたとき） */
  async function send(body?: string, mode?: QueueSendMode) {
    const message = (body ?? text).trim();
    if (!ready || !(message || attach.attachments.length > 0)) return;
    setSending(true);
    setError(undefined);
    try {
      if (queueing) await onQueue!(message, attach.attachments, mode);
      else await onSend(message, attach.attachments);
      setText("");
      attach.clear();
    } catch (e) {
      if (!(e instanceof SendCancelled)) setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  /** 送信ボタン・Enter: 録音中なら、止めて起こした文を入れてから送る */
  const submit = (mode?: QueueSendMode) => (dictation.recording ? void dictation.finish(true) : void send(undefined, mode));

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 録音中の Enter・⌘Enter は、起こした文を入れてそのまま送る
    if (dictation.recording && isSendEnter(e)) {
      e.preventDefault();
      return submit();
    }
    // 候補を出している間は、↑↓・Enter・Tab・Esc を候補の操作に使う
    if (suggest.handleKey(e)) return;
    // 空の入力欄・呼び出した発言を出している間の ↑↓ は、前の発言の呼び出しに使う
    if (promptHistory.handleKey(e)) return;
    if (isSendEnter(e)) {
      e.preventDefault();
      submit(sendModeOf(e));
    }
  }

  /** チャット欄の中（入力欄・下の道具）のキー: ⌘⇧Space で録音の開始・停止、録音中・文字起こし中の Esc でやめる */
  function onComposerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code === "Space" && e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault();
      dictation.toggle();
    } else if (e.key === "Escape" && (dictation.recording || dictation.state.kind === "transcribing")) {
      e.preventDefault();
      e.stopPropagation();
      dictation.cancel();
    }
  }

  return (
    <div className={cx("composer", attach.dragging && "dragging", compact && "compact")} onKeyDown={onComposerKeyDown} {...attach.dropProps}>
      {attach.files.length > 0 && (
        <div className="composer-attachments">
          <PendingFileChips files={attach.files} onRemove={attach.removeFile} />
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
        onPaste={attach.onPaste}
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
              if (e.target.files) attach.addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <DictationButton dictation={dictation} />
          {options && <RunOptionsBar state={options} />}
        </div>
        <div className="composer-actions">
        {trailing}
        {busy && busyControls}
        {/* 作業中は中断。書いていれば（録音中も）、その横に待ちの列に入れるボタン */}
        {busy && onStop && (
          <button className="send-button stop" title="中断" aria-label="中断" onClick={onStop}>
            <Square size={12} fill="currentColor" />
          </button>
        )}
        {(!busy || !onStop || (queueing && (hasContent || dictation.recording))) && (
          <button
            className="send-button"
            title={
              dictation.recording
                ? "録音を止めて、文字起こしした文を入れてそのまま送る（Enter）"
                : queueing
                  ? "待ちの列に入れる（Enter）。いまの作業が終わったら送ります"
                  : "送信（Enter）"
            }
            aria-label={dictation.recording ? "文字起こしして送信" : queueing ? "待ちの列に入れる" : "送信"}
            disabled={!canSend}
            onClick={() => submit()}
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        )}
        </div>
      </div>
      {attach.dragging && <div className="drop-hint">ここにドロップして添付</div>}
      <DictationError dictation={dictation} />
      <ErrorText message={error} className="composer-error" />
    </div>
  );
}
