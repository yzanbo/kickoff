import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * メニューの項目の横に開く子のメニューの開閉。
 * trigger は開く項目に渡す（乗せる・押す・→ で開く。メニューは閉じない）。同じメニューのほかの項目に乗せたら閉じる
 * （子のメニューの中にさらに子のメニューを開くときは、開いた項目のある子のメニューのほかの項目に乗せたら閉じる）。
 * back は ← で子のメニューを閉じて、開いた項目にピントを戻す
 */
export function useSubmenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = (e: { currentTarget: HTMLElement }) => setAnchor(e.currentTarget);
  // ほかの項目に乗せたら閉じる（子のメニューと開く項目の上では閉じない）
  useEffect(() => {
    const menu = anchor?.closest<HTMLElement>(".menu");
    if (!menu) return;
    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 開いた項目のあるメニュー（それ自身が子のメニューのこともある）の外の、子のメニューの上では閉じない
      const flyout = target.closest(".menu-flyout");
      if ((flyout && flyout !== menu) || target.closest(".menu-submenu") === anchor) return;
      if (target.closest("button")) setAnchor(null);
    };
    menu.addEventListener("mouseover", onOver);
    return () => menu.removeEventListener("mouseover", onOver);
  }, [anchor]);
  return {
    /** 開いている項目（閉じていれば null） */
    anchor,
    close: () => setAnchor(null),
    back: () => {
      anchor?.focus();
      setAnchor(null);
    },
    trigger: {
      role: "menuitem" as const,
      className: cx("menu-submenu", anchor && "open"),
      "aria-haspopup": "menu" as const,
      "aria-expanded": anchor !== null,
      onMouseEnter: open,
      onClick: open,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowRight") return;
        e.preventDefault();
        open(e);
      },
    },
  };
}

/**
 * 項目の横に開く子のメニュー（useSubmenu の anchor の横）。右に入らなければメニューの左に出し、下にはみ出すなら上へ寄せる
 * （自分の大きさが変わったら置き直す）。メニューの中の要素なので、外側のクリックでメニューごと閉じる。
 * ↑↓ はこの中だけで動き（data-menu-scope）、項目の上の ← で閉じて開いた項目に戻る（onBack）
 */
export function MenuFlyout({
  anchor,
  label,
  className,
  onBack,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  className?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 位置が決まるまでは見せない（visibility: hidden にすると中の欄にピントを置けないので、透明にする）
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const item = anchor.getBoundingClientRect();
      const menu = anchor.closest(".menu")?.getBoundingClientRect() ?? item;
      const { offsetWidth: width, offsetHeight: height } = el;
      const left = menu.right + 4 + width <= window.innerWidth ? menu.right + 4 : Math.max(8, menu.left - 4 - width);
      const top = Math.max(8, Math.min(item.top - 6, window.innerHeight - height - 8));
      setStyle({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);
  return (
    <div
      ref={ref}
      className={cx("menu menu-flyout", className)}
      style={style}
      role="menu"
      aria-label={label}
      data-menu-scope
      onKeyDown={(e) => {
        // ← は項目の上でだけ（入力欄では文字の間を動く）
        if (e.key === "ArrowLeft" && (e.target as HTMLElement).tagName === "BUTTON") {
          e.preventDefault();
          // 子のメニューの中の子のメニューで押したとき、外側の子のメニューまで閉じない
          e.stopPropagation();
          onBack();
        }
      }}
    >
      {children}
    </div>
  );
}
