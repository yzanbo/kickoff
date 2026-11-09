import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FindBar } from "./FindBar";
import { registerPageFind } from "./pageFind";

/**
 * ページの ⌘F（開いているページの中を探す）。ref の要素をページとして置き（ui/pageFind.ts）、⌘F で、
 * native が引き受ければ（ページの中のエディタの検索を開けたら）それに任せ、引き受けなければページの右上に検索の欄（FindBar）を出す。
 * 返す要素を、ページの中に描く（欄は ref の要素の中に出すので、その要素は position: relative にする）
 */
export function usePageFind(
  ref: RefObject<HTMLElement | null>,
  { native, placeholder, className, enabled = true }: { native?: (page: HTMLElement) => boolean; placeholder?: string; className?: string; enabled?: boolean } = {},
): ReactNode {
  // 検索の欄を出しているページ（閉じていれば null）と、⌘F を押した回（押すたびに欄にピントを置き直す）
  const [page, setPage] = useState<HTMLElement | null>(null);
  const [signal, setSignal] = useState(0);
  const nativeRef = useRef(native);
  nativeRef.current = native;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    return registerPageFind(el, () => {
      if (nativeRef.current?.(el)) {
        setPage(null);
        return;
      }
      setPage(el);
      setSignal((n) => n + 1);
    });
  }, [ref, enabled]);

  useEffect(() => {
    if (!enabled) setPage(null);
  }, [enabled]);

  if (!page) return null;
  return <FindBar target={page} host={page} focusSignal={signal} placeholder={placeholder} className={className} onClose={() => setPage(null)} />;
}
