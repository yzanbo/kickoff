// DB クライアントの外（右の欄の ▾ の「DB ▸」・Docker タブの「DB で開く」）から、開いた DB クライアントに頼むこと（接続を選ぶ・接続を足す・取り込みの案を選んで取り込みの画面を開く）。
// DB クライアントは開いたときに読む（React.lazy）ので、まだ描いていなければ置き場所ごとに預け、描いたときに受け取る
import { useEffect, useEffectEvent } from "react";
import type { DbImportCandidate } from "@shared/database/types";

export type DbClientRequest = { kind: "focus"; connectionId: number } | { kind: "add" } | { kind: "import"; candidate: DbImportCandidate };

const pending = new Map<string, DbClientRequest>();
const listeners = new Map<string, (request: DbClientRequest) => void>();

/** 置き場所（surfaceKey）の DB クライアントに頼む（描いていればすぐ、まだなら描いたときに） */
export function requestDbClient(surfaceKey: string, request: DbClientRequest): void {
  const listener = listeners.get(surfaceKey);
  if (listener) listener(request);
  else pending.set(surfaceKey, request);
}

/** surfaceKey の DB クライアントが頼みを受ける（預けてあったものも受け取る） */
export function useDbClientRequests(surfaceKey: string, onRequest: (request: DbClientRequest) => void): void {
  const handler = useEffectEvent(onRequest);
  useEffect(() => {
    const listener = (request: DbClientRequest) => handler(request);
    listeners.set(surfaceKey, listener);
    const waiting = pending.get(surfaceKey);
    if (waiting) {
      pending.delete(surfaceKey);
      listener(waiting);
    }
    return () => {
      if (listeners.get(surfaceKey) === listener) listeners.delete(surfaceKey);
    };
  }, [surfaceKey]);
}
