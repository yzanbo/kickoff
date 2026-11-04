import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "./Popover";

interface OptionItem<T extends string> {
  value: T;
  label: string;
  /** 項目の下に小さく出す説明 */
  description?: string;
  disabled?: boolean;
}

interface OptionGroup<T extends string> {
  /** 見出し（なければ見出しなし） */
  label?: string;
  items: OptionItem<T>[];
}

interface Props<T extends string> {
  value: T;
  /** ボタンに出す名前（選んだ項目の名前と違う表記にしたいとき） */
  display?: string;
  icon: ReactNode;
  groups: OptionGroup<T>[];
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}

/**
 * チャット欄の選択（アイコン・名前・▾ のボタンで、押すと上に一覧が開く）。
 * ↑↓ で選び、Enter で決定、Esc・外側のクリックで閉じる。
 */
export function OptionMenu<T extends string>({ value, display, icon, groups, ariaLabel, title, disabled, className, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<T>(value);
  const ref = useRef<HTMLDivElement>(null);
  const items = groups.flatMap((g) => g.items).filter((i) => !i.disabled);
  const selected = groups.flatMap((g) => g.items).find((i) => i.value === value);

  useEffect(() => {
    if (!open) return;
    setCursor(value);
    // 選んでいる項目が見えるところまでスクロールする
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    const index = items.findIndex((i) => i.value === cursor);
    if (e.key === "Escape") {
      // パネルを閉じる Esc より先に、一覧を閉じる
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // 選んでいるもの（cursor）が押せない項目なら、↓ で先頭・↑ で最後から（以前は ↑ で最後から 2 つ目に移っていた）
      const next = items[index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length];
      if (next) setCursor(next.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(cursor);
    }
  };

  return (
    <div ref={ref} className={`option-menu ${className ?? ""}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`option-button ${open ? "open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className="option-icon">{icon}</span>
        <span className="option-label">{display ?? selected?.label ?? value}</span>
        <ChevronDown size={14} className="option-chevron" aria-hidden />
      </button>
      {open && (
        // 外側のクリックで閉じる（Esc は一覧にピントがあるときに onKeyDown で閉じる）
        <Popover anchor={ref} side="above" escape="none" role="listbox" label={ariaLabel} className="option-popover" onClose={() => setOpen(false)}>
          {groups.map((g, gi) => (
            <div key={g.label ?? gi} className="option-group" role="group" aria-label={g.label}>
              {g.label && <div className="option-group-label">{g.label}</div>}
              {g.items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  className={`option-item ${item.value === cursor ? "cursor" : ""}`}
                  disabled={item.disabled}
                  onMouseEnter={() => setCursor(item.value)}
                  onClick={() => choose(item.value)}
                >
                  <span className="option-item-text">
                    <span className="option-item-label">{item.label}</span>
                    {item.description && <span className="option-item-desc">{item.description}</span>}
                  </span>
                  {item.value === value && <Check size={14} className="option-check" aria-hidden />}
                </button>
              ))}
            </div>
          ))}
        </Popover>
      )}
    </div>
  );
}
