import { Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "../cx";

/** チャットを名前で絞り込む検索欄（消すボタン付き）。検索語があるときの Esc は、パネルを閉じる Esc より先に検索語を消す */
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
  /** 候補の ↑↓・Enter（useListNavigation の onKeyDown）。Esc で文を消すのは欄が先に扱う */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** 欄の右端に置くもの（全文検索を開くボタンなど） */
  children?: ReactNode;
}) {
  return (
    <div className={cx("chat-search", className)}>
      <Search size={13} className="muted" aria-hidden />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onChange("");
          } else onKeyDown?.(e);
        }}
      />
      {value && (
        <button className="chat-search-clear" aria-label="検索を解除" onClick={() => onChange("")}>
          <X size={12} />
        </button>
      )}
      {children}
    </div>
  );
}
