import { ChevronUp } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cx } from "@/lib/cx";
import { Popover, type usePopover } from "@/ui/Popover";

/**
 * チャット欄の上のピル（指示の履歴・ToDo・サブエージェントで共通）。押すと上に一覧を開き（もう一度押す・外を押す・Esc で閉じる）、
 * 開いている間は ⌃ の向きのアイコンを回す（composer-chip.open）。children が一覧の中身
 */
export function ComposerChip({
  popover,
  chip,
  title,
  label,
  className,
  chipClassName,
  ignore,
  onToggle,
  onClose,
  ref,
  children,
}: {
  popover: ReturnType<typeof usePopover<HTMLButtonElement>>;
  /** ピルの中身（アイコンと文） */
  chip: ReactNode;
  /** ピルに乗せたときの説明 */
  title?: string;
  /** 一覧の読み上げの名前 */
  label: string;
  /** 一覧に足す class（chip-popover に足す） */
  className?: string;
  /** ピルに足す class（新しい子チャットができたときに光らせるなど） */
  chipClassName?: string;
  /** 外側のクリックとして閉じない要素のセレクタ（一覧から開く確かめのダイアログなど） */
  ignore?: string;
  /** ピルを押したとき（省けば開閉） */
  onToggle?: () => void;
  /** 一覧を閉じるとき（省けば閉じるだけ） */
  onClose?: () => void;
  /** ピルと一覧を入れた要素 */
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div ref={ref} className="chip-wrap">
      <button ref={popover.anchor} type="button" className={cx("composer-chip", popover.open && "open", chipClassName)} aria-expanded={popover.open} title={title} onClick={onToggle ?? popover.toggle}>
        {chip}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {popover.open && (
        <Popover anchor={popover.anchor} side="above" gap={8} label={label} className={cx("chip-popover", className)} ignore={ignore} onClose={onClose ?? popover.close}>
          {children}
        </Popover>
      )}
    </div>
  );
}
