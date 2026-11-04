import { useEffect, type RefObject } from "react";
import { useWindowEvent } from "./useWindowEvent";

/**
 * メニューを開いたらメニューそのものにピントを置き、↑↓ で項目を移る（↓ で先頭・↑ で最後から。macOS のメニューと同じ）。
 * 以前は先頭の項目にピントを置いていて、直前にキーを使っていると、右クリックで開いただけでも先頭の項目にピントの枠が出ていた。
 * メニューの中に横に開く一覧（data-menu-scope の付いた要素）があれば、ピントのある側の項目の中だけで動く
 */
export function useMenuKeys(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Esc・↑↓ をメニューで受け取れるよう、メニューそのものにピントを置く（項目は選んでいない状態から始める）
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
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
      const step = e.key === "ArrowDown" ? 1 : -1;
      // まだ項目を選んでいなければ、↓ で先頭・↑ で最後（以前は ↑ で最後から 2 つ目に移っていた）
      items[i < 0 ? (step > 0 ? 0 : items.length - 1) : (i + step + items.length) % items.length]?.focus();
    },
    true,
    true,
  );
}
