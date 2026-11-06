import assert from "node:assert/strict";
import { test } from "node:test";
import { memoMergePrompt, memoPlanPrompt, parseMergedMemo, parseMemoPlan } from "./memoAi.js";

const entries = [
  { path: "設計", dir: true },
  { path: "設計/画面.md", dir: false },
  { path: "メモ1.md", dir: false },
  { path: "メモ2.md", dir: false },
  { path: "readme.md", dir: false },
];

test("memoPlanPrompt: メモの書き出しを 1 行にし、頼みがなければおまかせの頼みにする。パスは \"\" で囲む（空白を含む名前でも区切りが分かる）", () => {
  const prompt = memoPlanPrompt([{ path: "a b.md", head: "一行目\n\n二行目" }], ["設計 資料", "x"], null);
  assert.match(prompt, /- "a b\.md": 一行目 二行目/);
  assert.match(prompt, /いまのフォルダ: "設計 資料", "x"/);
  assert.match(prompt, /頼み: 内容の近いメモ/);
});

test("parseMemoPlan: JSON の部分を読み、使える案だけを残す", () => {
  const answer = `整理案です。
{"moves":[
  {"from":"メモ1.md","to":"設計/ログイン","reason":"ログインの設計"},
  {"from":"メモ2.md","to":"./議事録/2026-11.md","reason":" 会議 "},
  {"from":"ない.md","to":"x.md"},
  {"from":"メモ1.md","to":"別/メモ1.md"},
  {"from":"readme.md","to":"設計/画面.md"},
  {"from":"設計/画面.md","to":"議事録/2026-11.md"},
  {"from":"設計/画面.md","to":"../外.md"},
  {"from":"設計/画面.md","to":"設計/画面.txt"},
  {"from":"readme.md","to":"README.md","reason":"大文字に"}
]}`;
  const plan = parseMemoPlan(answer, entries);
  assert.deepEqual(plan.moves, [
    { from: "メモ1.md", to: "設計/ログイン.md", reason: "ログインの設計" },
    { from: "メモ2.md", to: "議事録/2026-11.md", reason: "会議" },
    { from: "readme.md", to: "README.md", reason: "大文字に" },
  ]);
  // ないメモ・同じメモの 2 件目・行き先にもうある・行き先が重なる・外を指す・拡張子が変わる
  assert.equal(plan.skipped, 6);
});

test("parseMemoPlan: JSON でない答え・形の違う答えは空の案", () => {
  assert.deepEqual(parseMemoPlan("整理の必要はありません", entries), { moves: [], skipped: 0 });
  assert.deepEqual(parseMemoPlan('{"moves": "なし"}', entries), { moves: [], skipped: 0 });
  assert.deepEqual(parseMemoPlan("{壊れた", entries), { moves: [], skipped: 0 });
});

test("memoMergePrompt: いまのメモと足す文（出どころ付き）を見せ、全体の Markdown で答えてもらう", () => {
  const prompt = memoMergePrompt("# 設計\n\n認証は Cookie\n", "セッションは 30 日", "> チャット「ログイン」から（2026-11-06 10:00）");
  assert.match(prompt, /<いまのメモ>\n# 設計\n\n認証は Cookie\n<\/いまのメモ>/);
  assert.match(prompt, /<足す文 出どころ="チャット「ログイン」から（2026-11-06 10:00）">\nセッションは 30 日\n<\/足す文>$/);
  assert.match(prompt, /題名）は変えない/);
});

test("parseMergedMemo: 全体を囲む ``` を外し、最後に改行を 1 つ付ける。空なら null", () => {
  assert.equal(parseMergedMemo("```markdown\n# 設計\n\n本文\n```"), "# 設計\n\n本文\n");
  assert.equal(parseMergedMemo("  # 設計\n\n```ts\nx\n```\n\n"), "# 設計\n\n```ts\nx\n```\n");
  assert.equal(parseMergedMemo("  \n"), null);
});

test("parseMemoPlan: 行き先の名前の空白はそのまま使い、各段の前後の空白だけ外す", () => {
  const plan = parseMemoPlan('{"moves":[{"from":"a b.md","to":" 設計 資料 / 画面 一覧.md","reason":""}]}', [{ path: "a b.md", dir: false }]);
  assert.deepEqual(plan.moves, [{ from: "a b.md", to: "設計 資料/画面 一覧.md", reason: "" }]);
});
