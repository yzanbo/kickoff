import assert from "node:assert/strict";
import { test } from "node:test";
import { TerminalOutput } from "./output.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function output() {
  const sent: string[] = [];
  const out = new TerminalOutput((data) => sent.push(data), { cols: 40, rows: 5 });
  return { out, sent };
}

test("ターミナルの出力: 細かく届いた出力はまとめて送る", async () => {
  const { out, sent } = output();
  out.write("a");
  out.write("b");
  assert.deepEqual(sent, []);
  await wait(30);
  assert.deepEqual(sent, ["ab"]);
  out.dispose();
});

test("つなぎ直したときの画面の内容: 直前に書いた出力も入れて返し（裏の端末の書き込みは非同期）、同じものは送らない", async () => {
  const { out, sent } = output();
  out.write("hello");
  // 以前は裏の端末が読み終える前に取っていたので、直前の出力が入らず、画面にも送られずに消えた
  assert.equal(await out.snapshot(), "hello");
  await wait(30);
  assert.deepEqual(sent, []);
  out.dispose();
});

test("つなぎ直したときの画面の内容: 取っている間に届いた出力は、返したあとに送る（画面は返事より前の出力を捨てる）", async () => {
  const { out, sent } = output();
  out.write("before");
  const taken = out.snapshot();
  out.write("after");
  const sentWhenTaken = await taken.then((snapshot) => ({ snapshot, sent: [...sent] }));
  assert.deepEqual(sentWhenTaken, { snapshot: "before", sent: [] });
  await wait(30);
  assert.deepEqual(sent, ["after"]);
  out.dispose();
});

test("作業場所が見つからないときの注意: 最初の画面の内容に入り、出力としては送らない", async () => {
  const { out, sent } = output();
  out.write("\x1b[33m作業場所のフォルダが見つからないため、ホームフォルダで開きました（/gone）\x1b[0m\r\n");
  assert.match(await out.snapshot(), /作業場所のフォルダが見つからないため/);
  await wait(30);
  assert.deepEqual(sent, []);
  out.dispose();
});

test("止めたら: ためている出力は送らず、取っている途中の画面の内容は空で返す", async () => {
  const { out, sent } = output();
  out.write("x");
  const taken = out.snapshot();
  out.write("y");
  out.dispose();
  assert.equal(await taken, "");
  out.write("z");
  await wait(30);
  assert.deepEqual(sent, []);
});
