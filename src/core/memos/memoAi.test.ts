import assert from "node:assert/strict";
import { test } from "node:test";
import { memoChatPrompt, memoPlanPrompt, parseMemoChatReply, parseMemoPlan, stripEchoedFrame, unwrapFence } from "./memoAi.js";

const entries = [
  { path: "設計", dir: true },
  { path: "設計/画面.md", dir: false },
  { path: "メモ1.md", dir: false },
  { path: "メモ2.md", dir: false },
  { path: "readme.md", dir: false },
];

test("memoChatPrompt: メモ・選んだ部分・会話を入れ、選んだ部分の有無で案の的を変える", () => {
  const messages = [
    { role: "user" as const, text: "機能案を考えたい" },
    { role: "assistant" as const, text: "どんな利用者向けですか？" },
    { role: "user" as const, text: "反映して" },
  ];
  const all = memoChatPrompt(messages, "# 機能案", null);
  assert.match(all, /\n<memo>\n# 機能案\n<\/memo>/);
  assert.match(all, /target="memo"/);
  assert.doesNotMatch(all, /# 選んだ部分/);
  assert.ok(all.endsWith("利用者: 機能案を考えたい\nAI: どんな利用者向けですか？\n利用者: 反映して"));
  const part = memoChatPrompt(messages, "", "- エクセル");
  assert.match(part, /target="selection"/);
  assert.match(part, /\n<selection>\n- エクセル\n<\/selection>/);
  assert.match(part, /（まだ空）/);
});

test("memoChatPrompt: 長い会話は新しいものから残す", () => {
  const long = Array.from({ length: 40 }, (_, i) => ({ role: "user" as const, text: `${i}:${"あ".repeat(1500)}` }));
  const prompt = memoChatPrompt(long, "", null);
  assert.match(prompt, /利用者: 39:/);
  assert.doesNotMatch(prompt, /利用者: 0:/);
});

test("parseMemoChatReply: 返事と変更の案を分ける（案は最後のもの。印がなければ案なし）", () => {
  assert.deepEqual(parseMemoChatReply("  いいですね。どの形式から？ "), { reply: "いいですね。どの形式から？", edit: null });
  assert.deepEqual(parseMemoChatReply('表にしました。\n<memo-edit target="selection">\n| 形式 |\n|---|\n| Excel |\n</memo-edit>\n確認してください'), {
    reply: "表にしました。\n\n確認してください",
    edit: { target: "selection", text: "| 形式 |\n|---|\n| Excel |" },
  });
  // 閉じていない・``` で囲んだ案・空の案
  assert.deepEqual(parseMemoChatReply('まとめます\n<memo-edit target="memo">\n```markdown\n# 案\n```'), { reply: "まとめます", edit: { target: "memo", text: "# 案" } });
  assert.deepEqual(parseMemoChatReply('<memo-edit target="memo">\n</memo-edit>'), { reply: "", edit: null });
});

test("stripEchoedFrame: 元の文にない「---」・印の囲みだけを外す", () => {
  assert.equal(stripEchoedFrame("---\n# 機能案\n\n- 共有\n\n---", "# 機能案"), "# 機能案\n\n- 共有");
  assert.equal(stripEchoedFrame("<memo>\n# 案\n</memo>", "# 案"), "# 案");
  // 元のメモがフロントマターで始まる・囲みがない
  assert.equal(stripEchoedFrame("---\ntitle: x\n---", "---\ntitle: y\n---"), "---\ntitle: x\n---");
  assert.equal(stripEchoedFrame("# 案\n---", "# 案"), "# 案\n---");
});

test("unwrapFence: 全体を囲む ``` だけを外す（中にあるコードの囲みは残す）", () => {
  assert.equal(unwrapFence("```markdown\n# 見出し\n本文\n```"), "# 見出し\n本文");
  assert.equal(unwrapFence("  # そのまま  "), "# そのまま");
  assert.equal(unwrapFence("前\n```js\nx\n```"), "前\n```js\nx\n```");
});

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
