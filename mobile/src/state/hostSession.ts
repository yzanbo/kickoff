// 1 つの本体へのつながり（SSE の /api/events）。最初の hello で版と本体の ID を確かめ、知らせを受けた画面に配る。
// 切れたら少しずつ間を空けてつなぎ直す。アプリを裏に回したら止め（Android は裏で通信を止める）、表に戻ったらつなぎ直す
// （抜けた分は、画面が ?after= で取り直す = つながったときの onOpen）
import { fetch as expoFetch } from "expo/fetch";
import type { BusEvent, ServerHello } from "@shared/types";
import { MOBILE_OFF } from "@shared/types";
import type { ApiMismatch } from "@shared/api/version";
import { authHeaders, HostClient } from "../lib/client";
import { readSse } from "../lib/sse";
import { hostMismatch } from "../lib/version";

/** つながりの様子 */
export type SessionState =
  | { kind: "connecting" }
  | { kind: "open" }
  /** 切れた（つなぎ直しを待っている。reason は最後の理由） */
  | { kind: "retrying"; reason: string }
  /** 話が通じない（どちらかを更新するまで、つなぎ直さない） */
  | { kind: "mismatch"; mismatch: ApiMismatch }
  /** 本体のスマホ連携がオフ */
  | { kind: "mobile_off" }
  /** 端末を取り消された（つなぎ直すにはペアリングから） */
  | { kind: "revoked" }
  | { kind: "stopped" };

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

  /** つながったとき（つなぎ直したときも。画面は抜けた分を取り直す） */
  onOpen(fn: () => void) {
    this.openListeners.add(fn);
    return () => void this.openListeners.delete(fn);
  }

  start() {
    if (this.abort || this.state.kind === "mismatch" || this.state.kind === "revoked") return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.connect();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
    this.setState({ kind: "stopped" });
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
        const body = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
        if (res.status === 401) ended = { kind: "revoked" };
        else if (res.status === 403 && body?.code === MOBILE_OFF) ended = { kind: "mobile_off" };
        else if (res.status === 426) ended = { kind: "mismatch", mismatch: "client_too_old" };
        else ended = { kind: "retrying", reason: body?.error ?? `本体が ${res.status} を返しました` };
      } else {
        await readSse(res.body as unknown as ReadableStream<Uint8Array>, (m) => {
          if (m.event === "hello") {
            const hello = JSON.parse(m.data) as ServerHello;
            const mismatch = hostMismatch(hello);
            if (mismatch) {
              ended = { kind: "mismatch", mismatch };
              abort.abort();
              return;
            }
            this.retryMs = RETRY_MIN_MS;
            this.setState({ kind: "open" });
            for (const fn of this.openListeners) fn();
            return;
          }
          if (m.event !== null) return; // ping
          const event = JSON.parse(m.data) as BusEvent;
          // スマホ連携をオフにされたら、本体が SSE を切る（設定の知らせは端末に届かないので、切れたあと 403 で分かる）
          for (const fn of this.eventListeners) fn(event);
        });
      }
    } catch (e) {
      if (abort.signal.aborted && this.abort !== abort) return; // 止めた
      if (ended.kind === "retrying") ended = { kind: "retrying", reason: e instanceof Error ? e.message : String(e) };
    }
    if (this.abort !== abort) return; // 止めた・つなぎ直した
    this.abort = null;
    this.setState(ended);
    if (ended.kind === "retrying" || ended.kind === "mobile_off") {
      this.timer = setTimeout(() => this.start(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    }
  }
}
