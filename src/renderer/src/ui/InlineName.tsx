import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";

interface Props {
  initial?: string;
  placeholder?: string;
  className?: string;
  /** 文字数の上限（グループ名は 60、チャット名は 100） */
  maxLength?: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * その場で名前を入力・変更する欄（Enter・フォーカスを外すと決定、Esc で取り消し）。
 * 横の ✓ / ✕ でも決定・取り消しできる（押しても入力欄からフォーカスが外れないようにして、二重に動かない）
 */
export function InlineName({ initial = "", placeholder, className, maxLength = 60, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (submit && name && name !== initial) onSubmit(name);
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
        if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true);
        else if (e.key === "Escape") {
          // 取り消しだけにする（同じ Esc で右のパネルまで閉じないように）
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
    <IconButton
      icon={Check}
      label="決定"
      title="決定（Enter）"
      size={13}
      className="inline-name-ok"
      type="button"
      onMouseDown={keepFocus}
      onClick={() => finish(true)}
    />
    <IconButton icon={X} label="取り消し" title="取り消し（Esc）" size={13} type="button" onMouseDown={keepFocus} onClick={() => finish(false)} />
    </span>
  );
}
