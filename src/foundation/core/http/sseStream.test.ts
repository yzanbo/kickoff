import assert from "node:assert/strict";
import { test } from "vitest";
import { boundedWriter } from "./sseStream";

/** 書いた分が読まれるまで終わらない書き込み（遅い相手） */
function slowStream() {
  const pending: (() => void)[] = [];
  const written: string[] = [];
  return {
    written,
    drain: () => pending.splice(0).forEach((done) => done()),
    write: (msg: { data: string | Promise<string> }) =>
      new Promise<void>((resolve) => {
        written.push(String(msg.data));
        pending.push(resolve);
      }),
  };
}

test("SSE の相手が読まずにたまった分が上限を超えたら切り、それより後は書かない（読まれた分は数えから外す）", async () => {
  const stream = slowStream();
  let overflowed = 0;
  const write = boundedWriter(stream.write, () => overflowed++, 10);
  write({ data: "12345" });
  write({ data: "12345" });
  assert.equal(overflowed, 0);
  // 読まれたら、その分はたまっていない
  stream.drain();
  await Promise.resolve();
  write({ data: "12345" });
  write({ data: "12345" });
  assert.equal(overflowed, 0);
  write({ data: "x" });
  assert.equal(overflowed, 1);
  write({ data: "y" });
  assert.equal(overflowed, 1);
  assert.deepEqual(stream.written, ["12345", "12345", "12345", "12345"]);
});
