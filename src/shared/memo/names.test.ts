import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMemoName, safeMemoName, uniqueMemoName } from "./names";

test("safeMemoName: ファイル名に使えない文字を置き換え、隠しファイルにしない", () => {
  assert.equal(safeMemoName("a/b:c\\d"), "a-b-c-d");
  assert.equal(safeMemoName("  ..設定  メモ \n"), "設定 メモ");
  assert.equal(safeMemoName("   "), "無題のメモ");
  assert.equal([...safeMemoName("あ".repeat(200))].length, 80);
});

test("uniqueMemoName: 重なれば番号を付ける（大文字・小文字は同じとみなす）", () => {
  assert.equal(uniqueMemoName("メモ", []), "メモ");
  assert.equal(uniqueMemoName("Memo", ["memo", "Memo 2"]), "Memo 3");
});

test("chatMemoName: 同じチャットのメモの次の番号", () => {
  assert.equal(chatMemoName("ログイン画面", []), "ログイン画面 チャットメモ1");
  assert.equal(chatMemoName("ログイン画面", ["ログイン画面 チャットメモ1", "ログイン画面 チャットメモ3", "ほか チャットメモ9"]), "ログイン画面 チャットメモ4");
  // 名前に使えない文字はそろえてから比べる
  assert.equal(chatMemoName("a/b", ["a-b チャットメモ2"]), "a-b チャットメモ3");
});
