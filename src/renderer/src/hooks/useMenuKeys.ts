import { useEffect, type RefObject } from "react";
import { useWindowEvent } from "./useWindowEvent";

/** メニューを開いたら先頭の項目にピントを置き、↑↓ で項目を移る */
export function useMenuKeys(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [ref]);
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    },
    true,
    true,
  );
}
