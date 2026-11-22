import { useEffect, useSyncExternalStore } from "react";
import { createSignal } from "@shared/foundation/signal";
import { publishServerEvent, publishServerOpen, type AnyServerEvent } from "./events";

export type ConnectionState = "connecting" | "open" | "closed";

/** 接続の状態と、最後につながった時刻（このウィンドウで 1 つ。useServerConnection が書く。店は api を読むので store の cell を使わない） */
let connection: { state: ConnectionState; since: number | null } = { state: "connecting", since: null };
const changed = createSignal();
const setConnection = (next: typeof connection) => {
  connection = next;
  changed.emit();
};

/** サーバーとの接続の状態（下の帯の接続の札などが読む。つなぐのは殻の useServerConnection） */
export const useConnectionState = () => useSyncExternalStore(changed.subscribe, () => connection);

/**
 * サーバーとつなぎ（SSE の /api/events）、届いたイベントを events.ts の publishServerEvent で種類ごとに配る（殻の App・PopoutApp で 1 回だけ使う）。
 * 切れたら EventSource が自動でつなぎ直し、つなぎ直されない切断（認証の失敗など）は 5 秒ごとにこちらで張り直す。
 * つながるたびに publishServerOpen で知らせる（店 stores/ が、失敗した値と、つながる前・切れている間に読んだ値を取り直す）。
 * 接続の状態は useConnectionState で読む
 */
export function useServerConnection(): void {
  const setState = (state: ConnectionState) => connection.state !== state && setConnection({ ...connection, state });

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      source = new EventSource("/api/events");
      source.onopen = () => {
        setConnection({ state: "open", since: Date.now() });
        publishServerOpen();
      };
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return setState("connecting");
        // 自動再接続されない切断（認証エラーなど）は、こちらで張り直す
        setState("closed");
        if (!closed) retry = setTimeout(connect, 5000);
      };
      source.onmessage = (e) => {
        try {
          publishServerEvent(JSON.parse(e.data) as AnyServerEvent);
        } catch {
          // 不正なイベントは無視
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, []);
}
