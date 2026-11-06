import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import type { Attachment } from "@shared/types";
import type { GitTarget } from "@/api";
import { cx } from "@/lib/cx";
import { useOptionalSetting, useSetting } from "@/hooks/useSetting";
import type { Setting } from "@/lib/storage";
import { useHeldMeta } from "@/hooks/useHeldMeta";
import { consumeKey, hasModifiers, isCancelKey } from "@/lib/keys";
import { COMPOSER_COMPACT } from "@/lib/storageKeys";
import { AttachButton } from "@/features/chat/attachments/AttachButton";
import { PendingFileChips } from "@/features/chat/attachments/PendingFileChips";
import { ErrorText } from "@/ui/ErrorText";
import { DictationButton, DictationError } from "@/features/dictation/DictationButton";
import { insertDictation } from "@/features/dictation/dictationText";
import { useDictation } from "@/features/dictation/useDictation";
import { ChatOptionsBar, type ChatOptionsState } from "@/features/chat/options/ChatOptionsBar";
import { SuggestList } from "@/features/chat/composer/suggest/SuggestList";
import { useSuggest } from "@/features/chat/composer/suggest/useSuggest";
import { useComposerFiles } from "@/features/chat/attachments/useComposerFiles";
import { appendBlock } from "@/features/chat/messages/quoteComment";
import { usePromptHistory } from "./usePromptHistory";
import { isSendEnter, sendModeOf, useComposerKeys, type QueueSendMode } from "./composerKeys";
import type { ComposerHandle } from "./composerHandle";
import { ComposerActions } from "./ComposerActions";
import { useComposerSend } from "./useComposerSend";
import { ChatContextButton } from "./ChatContextButton";

interface Props {
  /** モデル・推論の深さ・権限モードの選択（なければ出さない。サブエージェントのタブなど） */
  options?: ChatOptionsState;
  placeholder?: string;
  autoFocus?: boolean;
  busy?: boolean;
  /** 送信ボタンの左に置くもの（コンテキストウィンドウのメーターなど） */
  trailing?: ReactNode;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onStop?: () => void;
  /** 停止を頼んで、止まるのを待っている（停止ボタンを「停止中…」にして、押し直せないようにする） */
  stopping?: boolean;
  /** 作業中（と queueWhileIdle のとき）だけ、送信ボタンの左に出すもの（送り方の切り替えなど） */
  busyControls?: ReactNode;
  /** 作業中に送ったとき（渡さなければ作業中は送れない）。mode はキーで決めたとき（⌘Enter = 伝える・⌘⇧Enter = ためておく。なければ切り替えのとおり） */
  onQueue?: (text: string, attachments: Attachment[], mode?: QueueSendMode) => Promise<void>;
  /** 作業していなくても、送るときに onQueue と busyControls（すぐ送る / ためておく）を使う（止めている送信待ちがあるとき） */
  queueWhileIdle?: boolean;
  /** 送信ボタンの名前（送り方で変わるとき。省けば既定の文） */
  sendLabel?: string;
  /** 書いている文が変わったとき（少し待ってから知らせる。新しいチャットの下書きのカードに出すため） */
  onTextChange?: (text: string) => void;
  /** / と @ の候補を出す作業場所（コマンド・ファイルをここから探す） */
  suggestTarget?: GitTarget;
  /** ↑↓ で呼び出す、このチャットで前に送った自分の発言（新しい順。新しいチャットの入力欄では渡さない） */
  history?: string[];
  /** 書きかけの文を残す設定（既存のチャットの chatDraft。新しいチャットはタブの draftText で残すので渡さない） */
  draft?: Setting<string>;
  /** 外からチャット欄を動かす口（文を入れる・ピントを移す。発言の一覧の「入力欄に入れる」など） */
  handleRef?: MutableRefObject<ComposerHandle | null>;
  /** このチャットの代わりに送れるほかの送り先（送信ボタンの右クリックで選ぶ。子チャットに送るなど）。作業中でも送れる */
  sendTo?: { label: string; title?: string; onSend: (text: string, attachments: Attachment[]) => Promise<void> }[];
  /** 「ほかのチャットを参照」（ほかのチャットのやり取りを AI に読ませる）を出すとき: 先に並べるプロジェクトと、出さないいまのチャット */
  chatContext?: { projectId?: number; exclude?: number };
}

/** 書いている文を知らせるまで待つ時間（打つたびに知らせない） */
const TEXT_CHANGE_DELAY_MS = 300;

/** 停止中に Esc を押したとき（もう止めているので何もしない） */
const ignoreStop = () => {};

/**
 * チャットの入力欄（Enter で送信・Shift+Enter で改行。📎・ドラッグ＆ドロップ・貼り付けでファイルを添付。
 * マイクで音声入力（⌘⇧Space でも始め・止める。録音中に送ると、起こした文を入れてそのまま送る。Esc でやめる））。
 * 送る処理は useComposerSend、右下の操作（中断・送信・送り方の切り替え）は ComposerActions
 */
export function Composer({ options, placeholder, autoFocus, busy, trailing, onSend, onStop, stopping, onQueue, queueWhileIdle, sendLabel, busyControls, onTextChange, suggestTarget, history, draft, handleRef, chatContext, sendTo }: Props) {
  // 新しいチャットも含め、入力欄は空から始める（あらかじめ文を入れない）。
  // 既存のチャットだけは、自分が書きかけていた文を戻す（送った・空にしたら消える）
  const [text, setText] = useOptionalSetting(draft, "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attach = useComposerFiles();
  /** 文を入れて、キャレットを caret に置く（描き直して高さが合ってから） */
  const fill = (value: string, caret = value.length, focus = true) => {
    setText(value);
    if (!focus) return;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };
  if (handleRef)
    handleRef.current = {
      fill: (value, opts) => {
        // 添付だけを足すとき（文が空で append）は、書いている文をそのままにする
        if (opts?.append && !value) {
          if (opts.focus !== false) textareaRef.current?.focus();
        } else fill(opts?.append ? appendBlock(text, value) : value, undefined, opts?.focus);
        // 添付も入れる（送信待ちの指示を新しいチャットで聞くとき。アップロード済みのものをそのまま使う）
        if (opts?.attachments) attach.addAttachments(opts.attachments);
      },
      focus: () => textareaRef.current?.focus(),
    };
  // コンパクト表示（文字・余白・下の道具を小さくする。設定の「表示」で切り替え、どのチャット欄にもすぐ効く）
  const [compact] = useSetting(COMPOSER_COMPACT);
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
  // 書いた分だけ高さを伸ばすのは CSS（composer.css の field-sizing: content と max-height）に任せる。
  // 以前はキーを押すたびに高さを auto に戻して scrollHeight を測っていて、そのたびにページ全体のレイアウトをその場でやり直させていた
  // （長いチャットで画面の要素が多いと、1 文字ごとに数十 ms かかり、文字入力が遅くなった原因の 1 つ）
  const sender = useComposerSend({
    text,
    files: attach,
    busy,
    queueWhileIdle,
    onSend,
    onQueue,
    onSent: () => {
      setText("");
      attach.clear();
    },
  });
  // 音声入力: 起こした文をキャレットの位置（選んでいればその範囲）に入れる。send なら、入れてそのまま送る
  const dictation = useDictation({
    onText: (spoken, sendNow) => {
      const el = textareaRef.current;
      const value = el?.value ?? text;
      const inserted = insertDictation(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, spoken);
      if (sendNow) {
        setText(inserted.text);
        void sender.send(inserted.text);
      } else {
        fill(inserted.text, inserted.caret);
      }
    },
  });
  // 録音中は、送信で「起こした文を入れてそのまま送る」
  const canSend = (sender.hasContent || dictation.recording) && sender.ready;

  /** 送信ボタン・Enter: 録音中なら、止めて起こした文を入れてから送る */
  const submit = (mode?: QueueSendMode) => (dictation.recording ? void dictation.finish(true) : void sender.send(undefined, mode));

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

  // ⌘ / ⌘⇧ を押している間だけ、その送り方（⌘Enter = 伝える・⌘⇧Enter = ためておく）のボタンを光らせる（作業中・送信待ちがあるときだけ。
  // 押しているキーでどちらになるかを、送る前に目で確かめられるように。選んでいる送り方そのものは変えない）。
  // キーを離した・ほかへピントが移った・Kickoff が後ろに回ったら消す（チャット欄の外で離したときも）
  const held = useHeldMeta();
  const heldMode: QueueSendMode | undefined = held.held === "meta-shift" ? "queue" : held.held === "meta" ? "tell" : undefined;

  // 停止中の Esc は何もしない（パネルを閉じる Esc にも渡さない）
  const keys = useComposerKeys({ busy, onStop: stopping ? ignoreStop : onStop, options });

  /** チャット欄の中のキー: ⌘⇧Space で録音の開始・停止、録音中の Esc でやめる。ほかは Esc 2 回で中断・Shift+Tab で権限モード（composerKeys.ts） */
  function onComposerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    held.track(e);
    if (e.code === "Space" && hasModifiers(e, { meta: true, shift: true })) {
      e.preventDefault();
      dictation.toggle();
    } else if (isCancelKey(e) && (dictation.recording || dictation.state.kind === "transcribing")) {
      consumeKey(e);
      dictation.cancel();
    } else keys.onKeyDown(e);
  }

  return (
    <div
      className={cx("composer", attach.dragging && "dragging", compact && "compact")}
      onKeyDown={onComposerKeyDown}
      onKeyUp={held.track}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && held.clear()}
      {...attach.dropProps}
    >
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
          <AttachButton size={16} className="attach-button" onFiles={attach.addFiles} />
          {chatContext && <ChatContextButton {...chatContext} onPick={attach.addChat} />}
          <DictationButton dictation={dictation} />
          {options && <ChatOptionsBar state={options} />}
        </div>
        <ComposerActions
          busy={busy}
          stopping={stopping}
          stopArmed={keys.stopArmed}
          onStop={onStop}
          queueing={sender.queueing}
          heldMode={heldMode}
          busyControls={busyControls}
          trailing={trailing}
          canSend={canSend}
          recording={dictation.recording}
          hasContent={sender.hasContent}
          sendLabel={sendLabel}
          onSubmit={() => submit()}
          // 録音中は、文字起こしが済むまでほかの送り先には送らない
          sendTargets={sendTo?.map((to) => ({ label: to.label, title: to.title, disabled: !sender.viaReady || dictation.recording, onSelect: () => void sender.sendVia(to.onSend) }))}
        />
      </div>
      {attach.dragging && <div className="drop-hint">ここにドロップして添付</div>}
      <DictationError dictation={dictation} />
      <ErrorText message={sender.error} className="composer-error" />
    </div>
  );
}
