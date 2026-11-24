import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { MenuButton } from "./menuParts";

/**
 * ボタンと ▾ の 2 つで 1 つ（押すといつもの操作、▾ で選べる操作のメニュー）。見た目は .split-button（CSS は土台の共通の型）。
 * moreLabel は ▾ の名前（読み上げ・メニューの名前）
 */
export function SplitButton({
  className,
  title,
  onClick,
  moreLabel,
  items,
  children,
}: {
  className?: string;
  title?: string;
  onClick: () => void;
  moreLabel: string;
  items: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={cx("split-button", className)}>
      <button type="button" className="split-button-main" title={title} onClick={onClick}>
        {children}
      </button>
      <MenuButton className="split-button-more" title={moreLabel} menuLabel={moreLabel} align="end" items={items}>
        <ChevronDown size={13} aria-label={moreLabel} />
      </MenuButton>
    </span>
  );
}
