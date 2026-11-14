// 1 つの本体へのつながり（SSE の /api/events）。最初の hello で版と本体の ID を確かめ（lib/connection.ts）、知らせを受けた画面に配る。
// 切れたら少しずつ間を空けてつなぎ直す。アプリを裏に回したら止め（Android は裏で通信を止める）、表に戻ったらつなぎ直す
// （抜けた分は、画面が ?after= で取り直す = つながったときの onOpen）。話が通じない・取り消された・別の本体なら、つなぎ直さずに止める
import { fetch as expoFetch } from "expo/fetch";
import type { BusEvent, ServerHello } from "@shared/types";
import { authHeaders, HostClient } from "../lib/client";
import { failureStateOf, helloStateOf, isFinal, type SessionState } from "../lib/connection";
import { readSse } from "../lib/sse";

export type { SessionState } from "../lib/connection";

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

export class HostSession {
  readonly client: HostClient;
  state: SessionState = { kind: "stopped" };
  private abort: AbortController | null = null;
  private retryMs = RETRY_MIN_MS;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly eventListeners = new Set<(e: BusEvent) => void>();
  private readonly stateListeners = new Set<(s: SessionState) => void>();
  private readonly openListeners = new Set<() => void>();

  constructor(
    readonly hostId: string,
    url: string,
    private readonly token: string,
  ) {
    this.client = new HostClient({ url, token });
  }

  onEvent(fn: (e: BusEvent) => void) {
    this.eventListeners.add(fn);
    return () => void this.eventListeners.delete(fn);
  }

  onState(fn: (s: SessionState) => void) {
    this.stateListeners.add(fn);
    return () => void this.stateListeners.delete(fn);
  }

  /** つながったとき（つなぎ直したときも。画面は抜けた分を取り直す・プッシュの宛先を知らせ直す） */
  onOpen(fn: () => void) {
    this.openListeners.add(fn);
    return () => void this.openListeners.delete(fn);
  }

  start() {
    if (this.abort || isFinal(this.state)) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.connect();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    // 話が通じない・取り消されたなどは、表に戻ってもつなぎ直さないので残す
    if (!isFinal(this.state)) this.setState({ kind: "stopped" });
  }

  private setState(state: SessionState) {
    this.state = state;
    for (const fn of this.stateListeners) fn(state);
  }

  private async connect() {
    const abort = new AbortController();
    this.abort = abort;
    this.setState({ kind: "connecting" });
    let ended: SessionState = { kind: "retrying", reason: "切れました" };
    try {
      const res = await expoFetch(`${this.client.access.url}/api/events`, { headers: { ...authHeaders(this.token), accept: "text/event-stream" }, signal: abort.signal });
      if (!res.ok || !res.body) {
        ended = failureStateOf(res.status, (await res.json().catch(() => null)) as { code?: string; error?: string } | null);
      } else {
        await readSse(res.body as unknown as ReadableStream<Uint8Array>, (m) => {
          if (m.event === "hello") {
            let hello: Partial<ServerHello> | null = null;
            try {
              hello = JSON.parse(m.data) as Partial<ServerHello>;
            } catch {
              // 読めなければ版を知らせない本体と同じ扱い
            }
            const state = helloStateOf(hello, this.hostId);
            if (state.kind !== "open") {
              ended = state;
              abort.abort();
              return;
            }
            this.retryMs = RETRY_MIN_MS;
            this.setState(state);
            for (const fn of this.openListeners) fn();
            return;
          }
          if (m.event !== null || this.state.kind !== "open") return; // ping・hello の前の知らせ
          let event: BusEvent;
          try {
            event = JSON.parse(m.data) as BusEvent;
          } catch {
            return;
          }
          for (const fn of this.eventListeners) fn(event);
        });
      }
    } catch (e) {
      if (this.abort !== abort) return; // 止めた
      if (ended.kind === "retrying") ended = { kind: "retrying", reason: e instanceof Error ? e.message : String(e) };
    }
    if (this.abort !== abort) return; // 止めた・つなぎ直した
    this.abort = null;
    this.setState(ended);
    // スマホ連携がオフ・切れたなら、間を空けてつなぎ直す（話が通じない・取り消された・別の本体ならつなぎ直さない）
    if (!isFinal(ended)) {
      this.timer = setTimeout(() => this.start(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    }
  }
}
