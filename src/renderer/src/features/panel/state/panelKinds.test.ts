import assert from "node:assert/strict";
import { test } from "vitest";
import { decodeKinds, shownActiveOf, toggleKind, withoutChat } from "./panelKinds";

test("表示するタブ: チャットのパネル = チャットだけ / 右サイドバー（チャット欄）= ブラウザだけ / フッター = ターミナルだけ（覚えた選び方によらない）", () => {
  assert.deepEqual(decodeKinds([], "board"), ["chat"]);
  assert.deepEqual(decodeKinds([], "side"), ["browser"]);
  assert.deepEqual(decodeKinds([], "bottom"), ["terminal"]);
  // 前に選んでいた種類は読まない
  assert.deepEqual(decodeKinds(["terminal", "bogus", "chat"], "side"), ["browser"]);
  assert.deepEqual(decodeKinds(["browser", "terminal"], "bottom"), ["terminal"]);
  assert.deepEqual(decodeKinds(["browser"], "board"), ["chat"]);
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

test("表示するタブ: チャットを出さない欄（全プロジェクトの画面）では、チャットを除く。チャットだけならターミナルとブラウザ", () => {
  assert.deepEqual(withoutChat(["chat", "terminal"], true), ["terminal"]);
  assert.deepEqual(withoutChat(["chat"], true), ["browser", "terminal"]);
  assert.deepEqual(withoutChat(["chat", "browser"], false), ["chat", "browser"]);
  assert.deepEqual(withoutChat(["terminal"], true), ["terminal"]);
});
