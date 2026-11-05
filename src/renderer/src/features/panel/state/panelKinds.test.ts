import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeKinds, shownActiveOf, toggleKind } from "./panelKinds";

test("表示するタブ: 未保存なら欄ごとの既定（ボード = チャット / チャット欄 = ブラウザ・ターミナル / フッター = ターミナル・ブラウザ）", () => {
  assert.deepEqual(decodeKinds([], "board"), ["chat"]);
  assert.deepEqual(decodeKinds([], "side"), ["browser", "terminal"]);
  assert.deepEqual(decodeKinds([], "bottom"), ["terminal", "browser"]);
  // 知らない値は捨て、並びはチャット → ブラウザ → ターミナル
  assert.deepEqual(decodeKinds(["terminal", "bogus", "chat"], "side"), ["chat", "terminal"]);
  assert.deepEqual(decodeKinds(["bogus"], "board"), ["chat"]);
});

test("表示するタブ: 付け外しする。最後の 1 つは外さない", () => {
  assert.deepEqual(toggleKind(["chat"], "terminal"), ["chat", "terminal"]);
  assert.deepEqual(toggleKind(["chat", "terminal"], "chat"), ["terminal"]);
  assert.deepEqual(toggleKind(["chat"], "chat"), ["chat"]);
});

test("表示するタブ: 隠した種類のタブを表示中にしていたら、見せている種類の最初のタブ。なければ空", () => {
  const pane = { type: "pane" as const, id: "p", tabs: ["chat:1", "terminal:a", "browser:b"], active: "chat:1" };
  assert.equal(shownActiveOf(pane, () => true), "chat:1");
  assert.equal(shownActiveOf(pane, (k) => !k.startsWith("chat")), "terminal:a");
  assert.equal(shownActiveOf(pane, () => false), null);
});

test("表示するタブ: チャットの画面の右の欄は、保存した値によらずいつもサブエージェントとファイル（変更・中身）だけ", () => {
  assert.deepEqual(decodeKinds([], "agents"), ["subagent", "file"]);
  assert.deepEqual(decodeKinds(["chat", "browser"], "agents"), ["subagent", "file"]);
  // ほかの欄の付け外しの選択肢には入らない
  assert.deepEqual(toggleKind(["chat"], "subagent"), ["chat"]);
  assert.deepEqual(toggleKind(["chat"], "file"), ["chat"]);
});
