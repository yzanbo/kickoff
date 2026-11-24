import { useState, type KeyboardEvent } from "react";
import { isSubmitKey } from "@/foundation/ui/lib/keys";
import { commitValue, followValue } from "./commitText";

interface Props {
  value: string;
  onCommit: (value: string) => void;
  /** 複数行の欄（textarea。Enter は改行で、欄の外を押す・⌘Enter で保存） */
  multiline?: boolean;
  /** 空では保存しない（空にして外へ出たら元の値に戻す） */
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  className?: string;
  "aria-label"?: string;
}

/**
 * 打つたびには保存せず、欄の外を押した・Enter で、変わっていれば保存する入力欄（前後の空白は除く）。
 * ピントのある間は、ほかで値が変わっても書きかけを書き換えない（commitText.ts）
 */
export function CommitInput({ value, onCommit, multiline = false, required = false, ...rest }: Props) {
  const [text, setText] = useState(value);
  const [base, setBase] = useState(value);
  const [focused, setFocused] = useState(false);
  // 保存した・ほかで変わった値に合わせ直す
  const follow = followValue({ text, base, value, focused });
  if (follow) {
    setBase(follow.base);
    setText(follow.text);
  }
  const commit = () => {
    const next = commitValue({ text, base, value }, { required });
    if (next !== null) onCommit(next);
    else if (required && text.trim() === "") setText(value);
  };
  const common = {
    ...rest,
    value: text,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      commit();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (!isSubmitKey(e) || (multiline && !e.metaKey)) return;
      e.preventDefault();
      commit();
    },
  };
  return multiline ? <textarea {...common} onChange={(e) => setText(e.target.value)} /> : <input {...common} onChange={(e) => setText(e.target.value)} />;
}
