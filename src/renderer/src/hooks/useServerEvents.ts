import { useEffect, useRef, useState } from "react";
import type { BusEvent } from "../../../core/types";

export type ConnectionState = "connecting" | "open" | "closed";

/** サーバーからのイベント（SSE）を購読する。切断時は EventSource が自動で再接続する */
/** サーバーからのイベントを受け取る。state は接続の状態、since は最後につながった時刻 */
export function useServerEvents(onEvent: (event: BusEvent) => void): { state: ConnectionState; since: number | null } {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [since, setSince] = useState<number | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      source = new EventSource("/api/events");
      source.onopen = () => {
        setState("open");
        setSince(Date.now());
      };
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return setState("connecting");
        // 自動再接続されない切断（認証エラーなど）は、こちらで張り直す
        setState("closed");
        if (!closed) retry = setTimeout(connect, 5000);
      };
      source.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data) as BusEvent);
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
