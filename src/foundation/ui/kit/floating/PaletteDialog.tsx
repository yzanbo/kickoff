import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import type { ActiveDescendantList } from "@/foundation/ui/kit/list/useRovingList";

/** usePaletteDialog が返すもの（PaletteDialog に渡す。close は選んだときに閉じる） */
export type PaletteModal = ReturnType<typeof useModalDialog>;

/** 探す窓のダイアログ（開いた直後に showModal。背景を押したら閉じる） */
export const usePaletteDialog = (): PaletteModal => useModalDialog();

/**
 * 探す窓の骨組み（⌘K・⌘⇧A・全文検索）: 入力欄の行（icon・入力欄・その後ろの物）・絞り込みの行（bars）・role="listbox" の一覧（children に role="option" の行）。
 * 入力欄の ↑↓・Enter は nav（useRovingList の activeDescendant）。onKeyDown が true を返したキーは nav に渡さない（Tab で絞り込みを回すなど）。
 * ↑↓ で選んだ行を見える所へ動かす
 */
export function PaletteDialog({
  modal,
  nav,
  className,
  label,
  icon,
  input,
  inputAfter,
  bars,
  onClose,
  children,
}: {
  modal: PaletteModal;
  nav: ActiveDescendantList;
  className?: string;
  label?: string;
  icon: ReactNode;
  input: { value: string; onChange(value: string): void; placeholder: string; label?: string; onKeyDown?(e: KeyboardEvent<HTMLInputElement>): boolean };
  inputAfter?: ReactNode;
  bars?: ReactNode;
  onClose(): void;
  children: ReactNode;
}) {
  const { ref, backdropProps } = modal;
  const { activeId } = nav;
  useEffect(() => {
    if (activeId) ref.current?.querySelector(`#${CSS.escape(activeId)}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId, ref]);
  return (
    <dialog ref={ref} className={cx("palette floating", className)} aria-label={label} onClose={onClose} {...backdropProps}>
      <div className="palette-input bar">
        {icon}
        <input
          autoFocus
          value={input.value}
          placeholder={input.placeholder}
          aria-label={input.label}
          onChange={(e) => input.onChange(e.target.value)}
          onKeyDown={(e) => input.onKeyDown?.(e) || nav.onKeyDown(e)}
          aria-activedescendant={activeId}
        />
        {inputAfter}
      </div>
      {bars}
      <ul className="palette-list" role="listbox">
        {children}
      </ul>
    </dialog>
  );
}
