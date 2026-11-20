import { useEffect, useState } from "react";
import { publishServerEvent, publishServerOpen, type AnyServerEvent } from "./events";

export type ConnectionState = "connecting" | "open" | "closed";

/**
 * サーバーとつなぎ（SSE の /api/events）、届いたイベントを events.ts の publishServerEvent で種類ごとに配る（殻の App・PopoutApp で 1 回だけ使う）。
 * 切れたら EventSource が自動でつなぎ直し、つなぎ直されない切断（認証の失敗など）は 5 秒ごとにこちらで張り直す。
 * つながるたびに publishServerOpen で知らせる（店 stores/ が、失敗した値と、つながる前・切れている間に読んだ値を取り直す）。
 * state は接続の状態、since は最後につながった時刻
 */
export function useServerConnection(): { state: ConnectionState; since: number | null } {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [since, setSince] = useState<number | null>(null);

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      source = new EventSource("/api/events");
      source.onopen = () => {
        setState("open");
        setSince(Date.now());
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

  return { state, since };
}
