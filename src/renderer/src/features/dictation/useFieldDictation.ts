import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { consumeKey, hasModifiers, isCancelKey, isSubmitKey } from "@/lib/keys";
import { insertDictation } from "./dictationText";
import { useDictation } from "./useDictation";

/**
 * 入力欄 1 つの音声入力（AI からの質問の「その他」の欄・送信待ちの書き直す欄。チャット欄は送り方が多いので Composer が自分で持つ）。
 * 起こした文をキャレットの位置（選んでいればその範囲）に入れる。録音中の Enter・決めるボタン（submit）は、入れてから onSubmit（⌘Enter なら meta 付き）。
 * 欄の中の ⌘⇧Space で開始・停止、録音中・文字起こし中の Esc でやめる（handleKey。扱ったら true を返すので、ほかのキーの扱いの前に呼ぶ）。
 * onInsert は文を入れる直前（「その他」を選ぶなど）
 */
export function useFieldDictation({
  textareaRef,
  value,
  onChange,
  onSubmit,
  onInsert,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (text: string) => void;
  onSubmit: (how: { meta: boolean }) => void;
  onInsert?: () => void;
}) {
  // 「入れてそのまま決める」とき、入れた文が value に入ってから（描き直したあとで）決める
  const submitAfterInsert = useRef<{ meta: boolean } | null>(null);
  useEffect(() => {
    const how = submitAfterInsert.current;
    if (!how) return;
    submitAfterInsert.current = null;
    onSubmit(how);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingMeta = useRef(false);
  const dictation = useDictation({
    onText: (spoken, send) => {
      const el = textareaRef.current;
      const current = el?.value ?? value;
      const inserted = insertDictation(current, el?.selectionStart ?? current.length, el?.selectionEnd ?? current.length, spoken);
      onInsert?.();
      onChange(inserted.text);
      if (send) submitAfterInsert.current = { meta: pendingMeta.current };
      else
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(inserted.caret, inserted.caret);
        });
    },
  });
  /** 録音中なら止めて文を入れてから決める（録音していなければ、すぐ決める） */
  const submit = (how: { meta: boolean }) => {
    if (!dictation.recording) return onSubmit(how);
    pendingMeta.current = how.meta;
    void dictation.finish(true);
  };
  /** 欄のキー（扱ったら true） */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (dictation.recording && isSubmitKey(e)) {
      e.preventDefault();
      submit({ meta: e.metaKey });
    } else if (e.code === "Space" && hasModifiers(e, { meta: true, shift: true })) {
      e.preventDefault();
      dictation.toggle();
    } else if (isCancelKey(e) && (dictation.recording || dictation.state.kind === "transcribing")) {
      consumeKey(e);
      dictation.cancel();
    } else return false;
    return true;
  };
  return { dictation, handleKey, submit };
}
