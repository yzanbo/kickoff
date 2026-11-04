import { useEffect, useRef } from "react";
import type { BusEvent } from "@shared/types";

type Listener = (event: BusEvent) => void;
const listeners = new Set<Listener>();

/** App が受け取ったサーバーイベント（useServerConnection）を各画面に配る */
export function publishServerEvent(event: BusEvent) {
  for (const listener of listeners) listener(event);
}

export function useServerEvent(handler: Listener) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener: Listener = (e) => ref.current(e);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

/** 部品の外（モジュール）でサーバーイベントを受け取る。やめるときは返り値を呼ぶ */
export function subscribeServerEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
