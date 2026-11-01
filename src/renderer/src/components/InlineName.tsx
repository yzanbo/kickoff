import { useEffect, useRef, useState } from "react";

interface Props {
  initial?: string;
  placeholder?: string;
  className?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** その場で名前を入力・変更する欄（Enter・フォーカスを外すと決定、Esc で取り消し） */
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

  return (
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
      onClick={(e) => e.stopPropagation()}
    />
  );
}
