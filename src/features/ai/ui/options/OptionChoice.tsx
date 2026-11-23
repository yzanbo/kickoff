import "./OptionChoice.css";
import { ChevronDown } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { anchorPlacement } from "@/foundation/ui/lib/floating";
import { ChoiceMenu, type ChoiceGroup } from "@/foundation/ui/kit/ChoiceMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/**
 * チャット欄の選択（アイコン・名前・▾ のボタン）。押す・↑↓ で上に選ぶメニュー（ChoiceMenu）を開き、
 * 選ぶ・Esc・外側のクリックで閉じてボタンにピントを戻す
 */
export function OptionChoice<T extends string>({
  value,
  display,
  icon,
  groups,
  label,
  title,
  disabled,
  className,
  menuClassName,
  onChange,
}: {
  value: T;
  /** ボタンに出す名前（選んだ項目の名前と違う表記にしたいとき） */
  display?: string;
  icon: ReactNode;
  groups: readonly ChoiceGroup<T>[];
  label: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** 開くメニューに足すクラス（幅など） */
  menuClassName?: string;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useContextMenu();
  const selected = groups.flatMap((g) => g.choices).find((c) => c.value === value);
  const open = () => button.current && menu.openAt(anchorPlacement(button.current, { side: "above", gap: 6 }), undefined);
  const close = () => {
    menu.close();
    button.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (menu.isOpen || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    open();
  };
  return (
    <div className={`option-menu ${className ?? ""}`} data-option-choice={id} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={`option-button ${menu.isOpen ? "open" : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title={title}
        disabled={disabled}
        onClick={() => (menu.isOpen ? close() : open())}
      >
        <span className="option-icon">{icon}</span>
        <span className="option-label">{display ?? selected?.label ?? value}</span>
        <ChevronDown size={14} className="option-chevron" aria-hidden />
      </button>
      {menu.menu && (
        <ChoiceMenu
          at={menu.menu.at}
          title={label}
          groups={groups}
          value={value}
          ignore={`[data-option-choice="${id}"]`}
          className={`option-choice-menu ${menuClassName ?? ""}`}
          onPick={onChange}
          onClose={close}
        />
      )}
    </div>
  );
}
