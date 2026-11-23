import "./SearchField.css";
import { Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { consumeKey, isCancelKey } from "@/foundation/ui/lib/keys";
import { IconButton } from "./IconButton";

/** 一覧を名前で絞り込む検索欄（消すボタン付き）。検索語があるときの Esc は、パネルを閉じる Esc より先に検索語を消す */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
  children,
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
  /** 候補の ↑↓・Enter（useRovingList の onKeyDown）。Esc で文を消すのは欄が先に扱う */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** 欄の右端に置くもの（全文検索を開くボタンなど） */
  children?: ReactNode;
}) {
  return (
    <div className={cx("search-field", className)}>
      <Search size={13} className="muted" aria-hidden />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (isCancelKey(e) && value) {
            // 文を消すだけにする（同じ Esc で <dialog> まで閉じないように）
            consumeKey(e, { immediate: true });
            onChange("");
          } else onKeyDown?.(e);
        }}
      />
      {value && (
        <IconButton icon={X} iconSize={12} className="search-field-clear" label="検索を解除" keys="Esc" onClick={() => onChange("")} />
      )}
      {children}
    </div>
  );
}
