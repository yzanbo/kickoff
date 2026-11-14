import assert from "node:assert/strict";
import { test } from "node:test";
import { createSseParser, readSse, type SseMessage } from "./sse";

test("createSseParser: 空行で区切り、名前付きの知らせ（hello・ping）と名前のない知らせを分ける。途中で切れた行もつなぐ", () => {
  const got: SseMessage[] = [];
  const parser = createSseParser((m) => got.push(m));
  parser.push('event: hello\ndata: {"host_id":"h"}\n\n');
  parser.push('data: {"type":"ch');
  parser.push('at"}\r\n\r\n');
  parser.push(": comment\n\nevent: ping\ndata: \n\n");
  assert.deepEqual(got, [
    { event: "hello", data: '{"host_id":"h"}' },
    { event: null, data: '{"type":"chat"}' },
    { event: "ping", data: "" },
  ]);
});

test("createSseParser: data が何行もあれば改行でつなぐ。\\r だけの行の終わりも読む（末尾の \\r は \\n が続くかもしれないので、次が届いてから）", () => {
  const got: SseMessage[] = [];
  const parser = createSseParser((m) => got.push(m));
  parser.push("data: a\rdata: b\r\r");
  assert.deepEqual(got, []);
  parser.push("data: c");
  assert.deepEqual(got, [{ event: null, data: "a\nb" }]);
});

test("readSse: ストリームの本文を最後まで読み、文字の途中で切れたバイトもつなぐ", async () => {
  const bytes = new TextEncoder().encode('data: {"t":"日本"}\n\n');
  // 「日」の途中で切る
  const cut = 12;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
  const got: SseMessage[] = [];
  await readSse(body, (m) => got.push(m));
  assert.deepEqual(got, [{ event: null, data: '{"t":"日本"}' }]);
});
