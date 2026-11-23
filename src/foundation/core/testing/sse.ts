// テストのリアルタイム配信（SSE）の読み手: つないで最初の知らせ（hello）を読み、条件の知らせが届くまで読む・切れたかを見る。
// 期限は上限で、届いたらすぐ返す（決め打ちの時間で待たない）。テストが終わったら閉じる。テストからだけ使う
import { afterTest } from "./afterTest";

/** 1 通の知らせ（event: の名前。なければ message。data: は JSON なら読んだ値） */
export interface SseMessage {
  event: string;
  data: unknown;
}

/** つないだ SSE */
export interface SseConnection {
  response: Response;
  /** つないですぐ届いた最初の知らせ（hello） */
  first: SseMessage | undefined;
  /** until を満たす知らせが届くまで読み、それまでに届いた知らせを返す（timeoutMs のうちに届かなければ、そこまで。切れたら、そこまで） */
  read(until: (message: SseMessage) => boolean, timeoutMs?: number): Promise<SseMessage[]>;
  /** 次に何か届くか（data）・切れるか（end）を timeoutMs まで見る（届かなければ open） */
  next(timeoutMs?: number): Promise<"data" | "end" | "open">;
  close(): Promise<void>;
}

/** data: の値（JSON でなければ文のまま） */
function parseData(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 区切り（空行）までのかたまりを知らせにする */
function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  return data.length === 0 && event === "message" ? null : { event, data: parseData(data.join("\n")) };
}

/** app（request を持つもの。Hono のアプリか、fetch を包んだもの）の /api/events につなぎ、最初の知らせを読む */
export async function openSse(app: { request(url: string, init: RequestInit): Response | Promise<Response> }, headers: Record<string, string>): Promise<SseConnection> {
  const response = await app.request("/api/events", { headers });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  const queue: SseMessage[] = [];
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  /** 次のかたまりを ms まで待つ（読みかけは次に引き継ぐ） */
  const pull = async (ms: number): Promise<"data" | "end" | "open"> => {
    pending ??= reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<"open">((resolve) => (timer = setTimeout(() => resolve("open"), ms)));
    const result = await Promise.race([pending, limit]);
    clearTimeout(timer);
    if (result === "open") return "open";
    pending = null;
    if (result.done) {
      ended = true;
      return "end";
    }
    buffer += decoder.decode(result.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const message = parseBlock(block);
      if (message) queue.push(message);
    }
    return "data";
  };
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await reader.cancel().catch(() => {});
  };
  afterTest(close);
  const read = async (until: (message: SseMessage) => boolean, timeoutMs = 1000) => {
    const out: SseMessage[] = [];
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (queue.length > 0) {
        const message = queue.shift()!;
        out.push(message);
        if (until(message)) return out;
      }
      const left = deadline - Date.now();
      if (ended || left <= 0 || (await pull(left)) !== "data") return out;
    }
  };
  await pull(1000);
  return {
    response,
    first: queue.shift(),
    read,
    next: async (timeoutMs = 1000) => (queue.length > 0 ? "data" : ended ? "end" : pull(timeoutMs)),
    close,
  };
}

/** 知らせの data の type（バスの知らせ。hello などは undefined） */
export const sseType = (message: SseMessage): string | undefined => (message.data as { type?: string } | null)?.type;
