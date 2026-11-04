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

// ---- つながったとき ----

/** reconnect: 一度切れてから、つなぎ直した（切れている間の知らせを取りこぼしたかもしれない） */
type OpenListener = (reconnect: boolean) => void;
const openListeners = new Set<OpenListener>();
let opened = false;

/** サーバーとの SSE がつながったことを知らせる（useServerConnection がつながるたびに呼ぶ） */
export function publishServerOpen() {
  const reconnect = opened;
  opened = true;
  for (const listener of [...openListeners]) listener(reconnect);
}

/** サーバーとつながったら listener を呼ぶ（読み込みに失敗した値・取りこぼしたかもしれない値を取り直すため）。やめるときは返り値を呼ぶ */
export function subscribeServerOpen(listener: OpenListener): () => void {
  openListeners.add(listener);
  return () => void openListeners.delete(listener);
}
