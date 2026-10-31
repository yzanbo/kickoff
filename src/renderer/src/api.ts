import { useEffect, useRef, useState } from "react";
import type { AppSettings, BusEvent, GitHubStatus, PlanUsage, ProviderStatus } from "../../core/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  settings: () => request<AppSettings>("GET", "/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>("PUT", "/api/settings", patch),
  providers: () => request<ProviderStatus[]>("GET", "/api/providers"),
  github: () => request<GitHubStatus>("GET", "/api/github"),
  usage: () => request<PlanUsage>("GET", "/api/usage"),
  refreshUsage: () => request<PlanUsage>("POST", "/api/usage/refresh"),
};

export type ConnectionState = "connecting" | "open" | "closed";

/** サーバーからのイベント（SSE）を購読する。切断時は EventSource が自動で再接続する */
export function useServerEvents(onEvent: (event: BusEvent) => void): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setState("open");
    source.onerror = () => setState(source.readyState === EventSource.CLOSED ? "closed" : "connecting");
    source.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as BusEvent);
      } catch {
        // 不正なイベントは無視
      }
    };
    return () => source.close();
  }, []);

  return state;
}

/** 非同期の読み込み状態をまとめて扱う */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => alive && (setData(d), setError(undefined)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, setData, error, loading, reload: () => setNonce((n) => n + 1) };
}
