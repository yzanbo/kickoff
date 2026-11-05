import assert from "node:assert/strict";
import { test } from "node:test";
import { memoPlanPrompt, parseMemoPlan } from "./memoAi.js";

const entries = [
  { path: "設計", dir: true },
  { path: "設計/画面.md", dir: false },
  { path: "メモ1.md", dir: false },
  { path: "メモ2.md", dir: false },
  { path: "readme.md", dir: false },
];

test("memoPlanPrompt: メモの書き出しを 1 行にし、頼みがなければおまかせの頼みにする", () => {
  const prompt = memoPlanPrompt([{ path: "a.md", head: "一行目\n\n二行目" }], ["設計"], null);
  assert.match(prompt, /- a\.md: 一行目 二行目/);
  assert.match(prompt, /いまのフォルダ: 設計/);
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
