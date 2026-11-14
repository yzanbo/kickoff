import { useState } from "react";
import { isSubmitKey } from "@/lib/keys";

/** 打つたびには保存せず、欄の外を押した・Enter で、変わっていれば保存する入力欄（前後の空白は除く） */
export function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (value: string) => void; type?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [base, setBase] = useState(value);
  // 保存した・ほかで変わった値に合わせ直す
  if (base !== value) {
    setBase(value);
    setText(value);
  }
  const commit = () => {
    const next = text.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!isSubmitKey(e)) return;
        e.preventDefault();
        commit();
      }}
    />
  );
}
