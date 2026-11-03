import { useEffect, type RefObject } from "react";
import { useWindowEvent } from "./useWindowEvent";

/**
 * メニューを開いたら先頭の項目にピントを置き、↑↓ で項目を移る。
 * メニューの中に横に開く一覧（data-menu-scope の付いた要素）があれば、ピントのある側の項目の中だけで動く
 */
export function useMenuKeys(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [ref]);
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const root = ref.current;
      if (!root) return;
      e.preventDefault();
      const scopeOf = (el: Element) => {
        const inner = el.closest<HTMLElement>("[data-menu-scope]");
        return inner && root.contains(inner) ? inner : root;
      };
      const active = document.activeElement;
      const scope = active && root.contains(active) ? scopeOf(active) : root;
      const items = [...scope.querySelectorAll<HTMLButtonElement>("button")].filter((b) => scopeOf(b) === scope);
      const i = items.indexOf(active as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    },
    true,
    true,
  );
}
