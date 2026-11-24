import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { observeSize, type ElementSize } from "@/foundation/ui/hooks/useSizeObserver";

/**
 * 要素の大きさ（枠を含む）。共有の見張り observeSize の上で、0 × 0（隠れている）・0.5px 未満の変化は知らせない。
 * 測るまでは null。ref は測る要素に渡す
 */
export function useElementSize<E extends HTMLElement>(): [RefObject<E | null>, ElementSize | null] {
  const ref = useRef<E>(null);
  const [size, setSize] = useState<ElementSize | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    return el ? observeSize(el, (next) => setSize(next)) : undefined;
  }, []);
  return [ref, size];
}
