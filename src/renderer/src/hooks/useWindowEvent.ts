import { useEffect, useRef } from "react";

/**
 * window のイベント（キー操作・アプリ内のイベント）を受け取る。
 * 登録は 1 回だけで、呼ぶのはいつも最新の handler（描画のたびに登録し直さない）
 */
export function useWindowEvent<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void, enabled?: boolean): void;
export function useWindowEvent(type: string, handler: (e: Event) => void, enabled?: boolean): void;
export function useWindowEvent(type: string, handler: (e: Event) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const listener = (e: Event) => ref.current(e);
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [type, enabled]);
}
