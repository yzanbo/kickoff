// SSE（本体の /api/events）の読み方。React Native には EventSource がないので、fetch のストリームを自分で読む。
// 読み方（行の分け方）は純粋な関数にしてテストする（sse.test.ts）

/** 1 つの知らせ（event がなければ名前のない知らせ = 本体の BusEvent） */
export interface SseMessage {
  event: string | null;
  data: string;
}

/**
 * 届いた文字を少しずつ渡すと、空行で区切られた知らせごとに onMessage を呼ぶ（行の終わりは \n・\r\n・\r のどれでもよい）。
 * 「:」で始まる行（コメント）と、data のない知らせは捨てる
 */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = "";
  let event: string | null = null;
  let data: string[] = [];
  const dispatch = () => {
    if (data.length > 0) onMessage({ event, data: data.join("\n") });
    event = null;
    data = [];
  };
  const line = (text: string) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      // 最後の行はまだ途中かもしれないので残す（\r のあとに \n が続くかもしれないので、末尾の \r も残す）
      const parts = buffer.split(/\r\n|\n|\r(?!$)/);
      buffer = parts.pop() ?? "";
      for (const p of parts) line(p);
    },
  };
}

/** fetch の応答の本文（ReadableStream）を読み切るまで、知らせを渡す。止めるときは fetch に渡した AbortSignal で */
export async function readSse(body: ReadableStream<Uint8Array>, onMessage: (message: SseMessage) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onMessage);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
