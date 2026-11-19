import { useEffect, useEffectEvent } from "react";

/**
 * window のイベント（キー操作・アプリ内のイベント）を受け取る。
 * 登録は 1 回だけで、呼ぶのはいつも最新の handler（描画のたびに登録し直さない）。
 * capture: ほかの要素のキー操作より先に受け取る（開いているメニューの ↑↓ など）
 */
export function useWindowEvent<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void, enabled?: boolean, capture?: boolean): void;
export function useWindowEvent(type: string, handler: (e: Event) => void, enabled?: boolean, capture?: boolean): void;
export function useWindowEvent(type: string, handler: (e: Event) => void, enabled = true, capture = false) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    if (!enabled) return;
    const listener = (e: Event) => onEvent(e);
    window.addEventListener(type, listener, capture);
    return () => window.removeEventListener(type, listener, capture);
  }, [type, enabled, capture]);
}
