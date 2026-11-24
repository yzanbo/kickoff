import { useEffect, useEffectEvent } from "react";
import type { ServerEventMap } from "@shared/foundation/contract";
import { createSignal } from "@shared/foundation/signal";

/** SSE の種類（各機能の src/shared/<機能>/events.ts が ServerEventMap に足したもの） */
export type ServerEventType = keyof ServerEventMap & string;
export type ServerEvent<E extends ServerEventType> = ServerEventMap[E];
export type AnyServerEvent = ServerEventMap[ServerEventType];

type Listener = (event: AnyServerEvent) => void;
/** 種類ごとの受け手（同じ種類の受け手は登録の順に呼ぶ） */
const listeners = new Map<string, Set<Listener>>();

/** 殻が受け取ったサーバーイベント（serverConnection.ts）を、その種類を購読している受け手に配る */
export function publishServerEvent(event: AnyServerEvent) {
  const set = listeners.get(event.type);
  if (!set) return;
  for (const listener of set) listener(event);
}

/** その種類（1 つか配列）が届いたら handler を呼ぶ（部品の外・モジュールで使う）。やめるときは返り値を呼ぶ */
export function onServerEvent<E extends ServerEventType>(type: E | readonly E[], handler: (event: ServerEvent<E>) => void): () => void {
  const types: readonly E[] = typeof type === "string" ? [type] : type;
  const listener = handler as Listener;
  for (const t of types) {
    let set = listeners.get(t);
    if (!set) listeners.set(t, (set = new Set()));
    set.add(listener);
  }
  return () => {
    for (const t of types) {
      const set = listeners.get(t);
      set?.delete(listener);
      if (set?.size === 0) listeners.delete(t);
    }
  };
}

/** 部品の中で、その種類（1 つか配列）を購読する */
export function useServerEvent<E extends ServerEventType>(type: E | readonly E[], handler: (event: ServerEvent<E>) => void) {
  // 登録は種類が変わったときだけで、呼ぶのはいつも最新の handler（配列は毎回作り直されるので、文字にして比べる）
  const onEvent = useEffectEvent(handler);
  const types = typeof type === "string" ? type : type.join(" ");
  useEffect(() => onServerEvent(types.split(" ") as E[], (e) => onEvent(e)), [types]);
}

// ---- つながったとき ----

/** つながった知らせ（店の仕組み store/ がこの口を読むので、知らせは共有の土台の createSignal から作る） */
const opened = createSignal();

/** サーバーとの SSE がつながったことを知らせる（serverConnection.ts が、初めてつながったとき・つなぎ直したときに呼ぶ） */
export function publishServerOpen() {
  opened.emit();
}

/**
 * サーバーとつながったら listener を呼ぶ（つながる前・切れている間の知らせは届かないので、その間に読んだ値と、失敗した値を取り直すため）。
 * やめるときは返り値を呼ぶ
 */
export function onServerOpen(listener: () => void): () => void {
  return opened.subscribe(listener);
}
