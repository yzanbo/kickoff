// DB クライアントの外（右の欄の ▾ の「DB ▸」）から、開いた DB クライアントに頼むこと（接続を選ぶ・接続を足す）。
// DB クライアントは開いたときに読む（React.lazy）ので、まだ描いていなければ置き場所ごとに預け、描いたときに受け取る
import { useEffect, useRef } from "react";

export type DbClientRequest = { kind: "focus"; connectionId: number } | { kind: "add" };

const pending = new Map<string, DbClientRequest>();
const listeners = new Map<string, (request: DbClientRequest) => void>();

/** place の DB クライアントに頼む（描いていればすぐ、まだなら描いたときに） */
export function requestDbClient(place: string, request: DbClientRequest): void {
  const listener = listeners.get(place);
  if (listener) listener(request);
  else pending.set(place, request);
}

/** place の DB クライアントが頼みを受ける（預けてあったものも受け取る） */
export function useDbClientRequests(place: string, onRequest: (request: DbClientRequest) => void): void {
  const handler = useRef(onRequest);
  handler.current = onRequest;
  useEffect(() => {
    const listener = (request: DbClientRequest) => handler.current(request);
    listeners.set(place, listener);
    const waiting = pending.get(place);
    if (waiting) {
      pending.delete(place);
      listener(waiting);
    }
    return () => {
      if (listeners.get(place) === listener) listeners.delete(place);
    };
  }, [place]);
}
