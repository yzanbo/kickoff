import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { settle } from "@shared/testing/async";
import { createHighlightPool, HIGHLIGHT_CACHE, HIGHLIGHT_MAX_CHARS, type HighlightJob, type HighlightReply, type HighlightWorker } from "./highlightPool";
import { encodeTokens } from "./tokenCodec";

/** 偽の Worker（頼まれたものを覚え、reply で返す） */
function fakeWorker() {
  const jobs: HighlightJob[] = [];
  const listeners: { message: ((e: MessageEvent<HighlightReply>) => void)[]; error: (() => void)[] } = { message: [], error: [] };
  let terminated = false;
  const worker: HighlightWorker = {
    postMessage: (job) => void jobs.push(job),
    addEventListener: (type: "message" | "error", listener: never) => void listeners[type].push(listener),
    terminate: () => void (terminated = true),
  };
  /** いちばん古い頼みに、1 行・1 断片（文字のまま）で答える */
  const reply = () => {
    const job = jobs.shift();
    assert.ok(job);
    const encoded = encodeTokens(job.code, job.code.split("\n").map((line) => [{ content: line, color: "#fff" }]));
    assert.ok(encoded);
    for (const l of listeners.message) l({ data: { id: job.id, encoded } } as MessageEvent<HighlightReply>);
    return job;
  };
  const crash = () => listeners.error.forEach((l) => l());
  return { worker, jobs, reply, crash, terminated: () => terminated };
}

function setup() {
  const workers: ReturnType<typeof fakeWorker>[] = [];
  const pool = createHighlightPool({
    spawn: () => {
      const w = fakeWorker();
      workers.push(w);
      return w.worker;
    },
  });
  onTestFinished(() => pool.dispose());
  return { pool, workers };
}

test("色付けは Worker に 1 つずつ頼み、結果を覚えて peek で同期に返す。同じコードは 2 回頼まない", async () => {
  const { pool, workers } = setup();
  assert.equal(pool.peek("a", "typescript", "dark"), undefined);
  const first = pool.highlight("a", "typescript", "dark");
  const same = pool.highlight("a", "typescript", "dark");
  const second = pool.highlight("b", "typescript", "dark");
  assert.equal(workers.length, 1);
  // 1 つずつ（前の答えが来るまで次を送らない）
  assert.equal(workers[0].jobs.length, 1);
  workers[0].reply();
  assert.deepEqual(await first, [[{ content: "a", color: "#fff" }]]);
  assert.equal(await same, await first);
  assert.equal(workers[0].jobs.length, 1);
  workers[0].reply();
  await second;
  assert.deepEqual(pool.peek("a", "typescript", "dark"), [[{ content: "a", color: "#fff" }]]);
  // 覚えたものは Worker に頼まない
  await pool.highlight("a", "typescript", "dark");
  assert.equal(workers[0].jobs.length, 0);
});

test("色を付けない言語・長すぎるコードは Worker に頼まず null（peek も null）", async () => {
  const { pool, workers } = setup();
  assert.equal(await pool.highlight("a", undefined, "dark"), null);
  assert.equal(await pool.highlight("a", "brainfuck", "dark"), null);
  assert.equal(await pool.highlight("x".repeat(HIGHLIGHT_MAX_CHARS + 1), "typescript", "dark"), null);
  assert.equal(pool.peek("a", undefined, "dark"), null);
  assert.equal(workers.length, 0);
});

test("見えているもの（visible）を手前のもの（near）より先に色付けし、取り消したまだのものは捨てる", async () => {
  const { pool, workers } = setup();
  const busy = pool.highlight("busy", "typescript", "dark");
  const abort = new AbortController();
  const near1 = pool.highlight("near1", "typescript", "dark", { priority: "near" });
  const cancelled = pool.highlight("gone", "typescript", "dark", { priority: "near", signal: abort.signal });
  const visible = pool.highlight("visible", "typescript", "dark");
  abort.abort();
  assert.equal(await cancelled, null);
  const w = workers[0];
  assert.equal(w.reply().code, "busy");
  await busy;
  assert.equal(w.reply().code, "visible");
  await visible;
  assert.equal(w.reply().code, "near1");
  await near1;
  await settle();
  assert.equal(w.jobs.length, 0);
});

test("覚える数の上限で古いものから捨て、1 件の字数の上限を超えるものは覚えない", async () => {
  const { pool, workers } = setup();
  const big = "x".repeat(HIGHLIGHT_CACHE.maxItem + 1);
  const p = pool.highlight(big, "typescript", "dark");
  workers[0].reply();
  assert.ok(await p);
  assert.equal(pool.peek(big, "typescript", "dark"), undefined);
});

test("Worker が落ちたら待っていたものは null で終わり、次に頼むときに作り直す。dispose で止める", async () => {
  const { pool, workers } = setup();
  const p = pool.highlight("a", "typescript", "dark");
  workers[0].crash();
  assert.equal(await p, null);
  assert.equal(workers[0].terminated(), true);
  const q = pool.highlight("b", "typescript", "dark");
  assert.equal(workers.length, 2);
  pool.dispose();
  assert.equal(await q, null);
  assert.equal(workers[1].terminated(), true);
});
