import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { isCancelKey, isComposing } from "@/lib/keys";
import { IconButton } from "./IconButton";

interface Props {
  initial?: string;
  placeholder?: string;
  className?: string;
  /** 文字数の上限（グループ名は 60、チャット名は 100） */
  maxLength?: number;
  /** 入力欄のすぐ右に添える文（メモの拡張子など。名前には含めない） */
  suffix?: string;
  /** 開いたときに選ぶ範囲の始まり（既定は 0 = 全体。頭の日付を残して後ろだけを書き換えてもらうときなど） */
  selectFrom?: number;
  /** 書いた名前を使えないときの理由（使えるなら null）。理由があれば欄の下に出し、Enter・✓ では決めない（フォーカスを外すと取り消し） */
  validate?: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * その場で名前を入力・変更する欄（Enter・フォーカスを外すと決定、Esc で取り消し）。
 * 横の ✓ / ✕ でも決定・取り消しできる（押しても入力欄からフォーカスが外れないようにして、二重に動かない）。
 * validate があれば書くたびに確かめ、使えない名前なら理由を欄の下に出して決めさせない（同じ名前のビューなど）
 */
export function InlineName({ initial = "", placeholder, className, maxLength = 60, suffix, selectFrom = 0, validate, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  // 元の名前のまま・空は決めても何も変えない（取り消しと同じ）ので確かめない
  const trimmed = value.trim();
  const error = validate && trimmed && trimmed !== initial ? validate(trimmed) : null;
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const errorId = useId();

  useEffect(() => {
    ref.current?.focus();
    const input = ref.current;
    if (input && selectFrom > 0) {
      input.setSelectionRange(selectFrom, input.value.length);
      // 狭い欄でも頭（残す日付など）から見せる（選んだ範囲の終わりまでスクロールして、頭が隠れるため）
      input.scrollLeft = 0;
    } else input?.select();
  }, []);

  const finish = (submit: boolean) => {
    if (done.current) return;
    // 使えない名前は、Enter・✓ では決めずに書き直してもらう（フォーカスを外したときは取り消しにする onBlur）
    if (submit && error) return;
    done.current = true;
    const name = value.trim();
    if (submit && name && name !== initial && !error) onSubmit(name);
    else onCancel();
  };

  // ボタンを押したときに入力欄のフォーカスが外れる（＝決定される）のを防ぐ
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <span className="inline-name-wrap" onClick={(e) => e.stopPropagation()}>
    <input
      ref={ref}
      type="text"
      className={`inline-name ${className ?? ""}`}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // 日本語入力の変換確定の Enter では決定しない
        if (e.key === "Enter" && !isComposing(e)) finish(true);
        else if (isCancelKey(e)) {
          // 取り消しだけにする（同じ Esc で右のパネルまで閉じないように）
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          finish(false);
        }
      }}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onBlur={() => (error ? finish(false) : finish(true))}
    />
    {error && (
      <span id={errorId} className="inline-name-error" role="alert">
        {error}
      </span>
    )}
    {suffix && <span className="inline-name-suffix">{suffix}</span>}
    <IconButton
      icon={Check}
      label="決定"
      title="決定（Enter）"
      size={13}
      className="inline-name-ok"
      type="button"
      disabled={Boolean(error)}
      onMouseDown={keepFocus}
      onClick={() => finish(true)}
    />
    <IconButton icon={X} label="取り消し" title="取り消し（Esc）" size={13} type="button" onMouseDown={keepFocus} onClick={() => finish(false)} />
    </span>
  );
}
