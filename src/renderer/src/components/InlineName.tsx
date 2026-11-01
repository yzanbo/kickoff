import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  initial?: string;
  placeholder?: string;
  className?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * その場で名前を入力・変更する欄（Enter・フォーカスを外すと決定、Esc で取り消し）。
 * 横の ✓ / ✕ でも決定・取り消しできる（押しても入力欄からフォーカスが外れないようにして、二重に動かない）
 */
export function InlineName({ initial = "", placeholder, className, onSubmit, onCancel }: Props) {
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
      maxLength={60}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // 日本語入力の変換確定の Enter では決定しない
        if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true);
        else if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
    <button type="button" className="icon-button inline-name-ok" title="決定（Enter）" aria-label="決定" onMouseDown={keepFocus} onClick={() => finish(true)}>
      <Check size={13} />
    </button>
    <button type="button" className="icon-button" title="取り消し（Esc）" aria-label="取り消し" onMouseDown={keepFocus} onClick={() => finish(false)}>
      <X size={13} />
    </button>
    </span>
  );
}
