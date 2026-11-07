import assert from "node:assert/strict";
import { test } from "node:test";
import { chatTargetName, parentTargetName } from "./chatTitle";

test("足す先の呼び名: 名前を「」で囲み、長ければ省略する。一覧になければ「チャット」", () => {
  assert.equal(chatTargetName({ title: "機能開発" }), "「機能開発」");
  assert.equal(chatTargetName({ title: null }), "「Untitled Chat」");
  assert.equal(chatTargetName({ title: "とても長いチャットの名前です" }, 8), "「とても長いチャ…」");
  assert.equal(chatTargetName(undefined), "チャット");
});

test("子チャットの中で選んだ文の足す先: 直接の親なら「親チャット（名前）」、孫チャットから根へ・子チャットの外なら名前だけ", () => {
  const root = { id: 2, title: "機能開発" };
  assert.equal(parentTargetName(root, { parent_chat_id: 2 }), "親チャット（機能開発）");
  assert.equal(parentTargetName(root, { parent_chat_id: 35 }), "「機能開発」");
  assert.equal(parentTargetName(root, undefined), "「機能開発」");
  assert.equal(parentTargetName({ id: 2, title: "とても長いチャットの名前です" }, { parent_chat_id: 2 }, 8), "親チャット（とても長いチャ…）");
  assert.equal(parentTargetName(undefined, { parent_chat_id: 2 }), "チャット");
});
