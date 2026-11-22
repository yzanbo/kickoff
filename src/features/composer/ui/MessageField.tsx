import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject, type TextareaHTMLAttributes } from "react";
import { consumeKey } from "@/foundation/ui/lib/keys";
import { useHeldMeta } from "@/foundation/ui/hooks/useHeldMeta";
import { NO_VOICE, useFieldVoice, type FieldBridge } from "./composerSlots";
import { fieldKeyAction, PLAIN_SUBMIT, submitHowOf, type SubmitHow } from "./messageFieldModel";

export interface MessageFieldInput {
  value: string;
  onChange: (text: string) => void;
  /** 送る・決める（Enter・送信ボタン。録音中なら文字にして入れてから） */
  onSubmit: (how: SubmitHow) => void;
  /** Esc でやめる（渡さなければ Esc はパネルを閉じるのに任せる） */
  onCancel?: () => void;
  /** 先に見るキー（候補の一覧・前の発言の呼び出し。扱ったら true） */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** ⌘⇧Enter でも送る（チャット欄の「あとで」） */
  metaShift?: boolean;
  /** false なら音声入力なし（吹き出しの書き直し） */
  voice?: boolean;
  /** 声を文字にした文を入れる直前（質問の「その他」を選ぶ） */
  onVoiceInsert?: () => void;
  /** 開いたら文の終わりにピントを置く */
  focusEnd?: boolean;
  /** 欄の要素（候補・前の発言の呼び出しなど、欄を作る前に要る hooks と分け合うとき。省けば中で作る） */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** 欄からピントが出ても ⌘ の光りを消さない（チャット欄。枠の外へ出たときに呼ぶ側が消す） */
  keepHeldOnBlur?: boolean;
}

/**
 * 文を書く欄の芯の状態（チャット欄・送信待ちの書き直し・質問の「その他」・吹き出しの書き直しで共通）:
 * Enter で送る・Shift+Enter で改行・Esc でやめる（変換中の Enter・Esc は変換に使う）・⌘ を押している間（held）・
 * 音声入力（composerSlots の voice。録音中に送ると、止めて文字にして入れてから送る）。
 * 欄は MessageField に渡し、マイクのボタン（voice.button）・失敗の文（voice.error）は呼ぶ側が置く
 */
export function useMessageField(input: MessageFieldInput) {
  const { value, onChange, onSubmit, onCancel, metaShift = false, voice: voiceOn = true, focusEnd = false, keepHeldOnBlur = false } = input;
  const ownRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = input.textareaRef ?? ownRef;
  const held = useHeldMeta();
  // 録音中に送ったときの修飾キー（文字にして入れ、描き直したあとで送る）
  const pendingSubmit = useRef<SubmitHow | null>(null);
  const [inserted, setInserted] = useState(0);
  const submitInserted = useEffectEvent((how: SubmitHow) => onSubmit(how));
  useEffect(() => {
    const how = pendingSubmit.current;
    if (!how) return;
    pendingSubmit.current = null;
    submitInserted(how);
  }, [inserted]);
  const bridge: FieldBridge = {
    read: () => {
      const el = textareaRef.current;
      const text = el?.value ?? value;
      return { text, start: el?.selectionStart ?? text.length, end: el?.selectionEnd ?? text.length };
    },
    write: (text, caret, sendNow) => {
      input.onVoiceInsert?.();
      onChange(text);
      if (sendNow) {
        if (!pendingSubmit.current) pendingSubmit.current = PLAIN_SUBMIT;
        setInserted((n) => n + 1);
      } else {
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          el?.focus();
          el?.setSelectionRange(caret, caret);
        });
      }
    },
  };
  const slotVoice = useFieldVoice(bridge);
  const voice = voiceOn ? slotVoice : NO_VOICE;
  // 開いたら文の終わりから書き始める
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!focusEnd || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  /** 送る（録音中なら、止めて文字にして入れてから） */
  const submit = (how: SubmitHow) => {
    if (!voice.recording) return onSubmit(how);
    pendingSubmit.current = how;
    voice.finishAndSend();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    held.track(e);
    const action = fieldKeyAction(e, {
      recording: voice.recording,
      metaShift,
      cancellable: onCancel !== undefined,
      caller: () => input.onKeyDown?.(e) ?? false,
      voice: () => voice.onKeyDown(e),
    });
    if (action === "voiceSend" || action === "submit") {
      e.preventDefault();
      submit(submitHowOf(e));
    } else if (action === "cancel") {
      consumeKey(e);
      onCancel?.();
    }
  };
  return {
    value,
    onChange,
    textareaRef,
    /** 音声とつなぐ口（音声モードも同じ欄に入れる） */
    bridge,
    voice,
    /** ⌘ を押している間（⌘Enter・⌘⇧Enter で使われるボタンを光らせる） */
    held,
    submit,
    onKeyDown,
    onKeyUp: (e: KeyboardEvent<HTMLTextAreaElement>) => held.track(e),
    onBlur: (_e: FocusEvent<HTMLTextAreaElement>) => {
      if (!keepHeldOnBlur) held.clear();
    },
  };
}

export type MessageFieldState = ReturnType<typeof useMessageField>;

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onKeyDown" | "onKeyUp" | "onBlur" | "onSelect">;

/** 文を書く欄（textarea はこれだけ）。高さは CSS の field-sizing。onCaret は打つ・選ぶたびのキャレットの位置（候補） */
export function MessageField({ field, onCaret, ...rest }: TextareaProps & { field: MessageFieldState; onCaret?: (at: number) => void }) {
  const { textareaRef, value, onChange, onKeyDown, onKeyUp, onBlur } = field;
  return (
    <textarea
      ref={textareaRef}
      {...rest}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        onCaret?.(e.target.selectionStart);
      }}
      onSelect={onCaret && ((e) => onCaret(e.currentTarget.selectionStart))}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    />
  );
}
