import { useSyncExternalStore } from "react";

/** メディアクエリに合っているか（画面の幅などが変わったら描き直す） */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => matchMedia(query).matches,
  );
}
