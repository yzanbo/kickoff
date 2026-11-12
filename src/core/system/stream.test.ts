import assert from "node:assert/strict";
import { test } from "node:test";
import { lineSplitter, stopAllStreams, streamCommand } from "./stream.js";

test("lineSplitter: 塊の途中で切れた行をつなぎ、\\r を落とし、終わりに残りを出す", () => {
  const lines: string[] = [];
  const s = lineSplitter((l) => lines.push(l));
  s.push("a\r\nb");
  s.push("c\nd");
  assert.deepEqual(lines, ["a", "bc"]);
  s.end();
  assert.deepEqual(lines, ["a", "bc", "d"]);
});

test("streamCommand: 標準出力を 1 行ずつ渡し、終了コードと標準エラーの最後の行を返す", async () => {
  const out: string[] = [];
  const errs: string[] = [];
  const run = streamCommand(process.execPath, ["-e", "console.log('1');console.log('2');for (let i = 0; i < 5; i++) console.error('e' + i);process.exit(3)"], {
    onLine: (l) => out.push(l),
    onErrorLine: (l) => errs.push(l),
    tailLines: 2,
  });
  const result = await run.done;
  assert.deepEqual(out, ["1", "2"]);
  assert.equal(errs.length, 5);
  assert.deepEqual(result, { code: 3, stderrTail: "e3\ne4", stopped: false });
});

test("streamCommand: stop() で止めると stopped が付き、終了コードは null", async () => {
  const run = streamCommand(process.execPath, ["-e", "console.log('ready'); setInterval(() => {}, 1000)"], {
    onLine: () => run.stop(),
  });
  const result = await run.done;
  assert.equal(result.stopped, true);
  assert.equal(result.code, null);
});

test("streamCommand: 起動できなければ理由を返す（reject しない）", async () => {
  const result = await streamCommand("/no/such/command-kickoff", []).done;
  assert.equal(result.code, null);
  assert.match(result.stderrTail, /ENOENT/);
});

test("stopAllStreams: 動いているものをまとめて止める", async () => {
  const a = streamCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  const b = streamCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  stopAllStreams();
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.equal(ra.stopped && rb.stopped, true);
});
