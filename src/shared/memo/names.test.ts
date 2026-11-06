import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMemoName, defaultMemosFolderName, safeMemoName, uniqueMemoName } from "./names";

test("safeMemoName: ファイル名に使えない文字を置き換え、隠しファイルにしない", () => {
  assert.equal(safeMemoName("a/b:c\\d"), "a-b-c-d");
  // 続く空白・改行は 1 つの空白に（名前の空白はそのまま使う）
  assert.equal(safeMemoName("  ..設定  メモ \n"), "設定 メモ");
  assert.equal(safeMemoName("   "), "無題のメモ");
  assert.equal([...safeMemoName("あ".repeat(200))].length, 80);
  // 切った端に空白が来ても、終わりに空白を残さない
  assert.equal(safeMemoName(`${"あ".repeat(79)} い`), "あ".repeat(79));
});

test("defaultMemosFolderName: アプリ名を小文字にして空白を入れない", () => {
  assert.equal(defaultMemosFolderName("Kickoff"), "kickoff");
  assert.equal(defaultMemosFolderName("Kickoff Dev"), "kickoff-dev");
  assert.equal(defaultMemosFolderName(" My  App "), "my-app");
});

test("uniqueMemoName: 重なれば番号を付ける（大文字・小文字は同じとみなす）", () => {
  assert.equal(uniqueMemoName("メモ", []), "メモ");
  assert.equal(uniqueMemoName("Memo", ["memo", "Memo-2"]), "Memo-3");
});

test("chatMemoName: 同じチャットのメモの次の番号", () => {
  assert.equal(chatMemoName("ログイン画面", []), "ログイン画面 チャットメモ1");
  assert.equal(chatMemoName("ログイン画面", ["ログイン画面 チャットメモ1", "ログイン画面 チャットメモ3", "ほか チャットメモ9"]), "ログイン画面 チャットメモ4");
  // 名前に使えない文字はそろえてから比べる。空白はそのまま
  assert.equal(chatMemoName("a/b", ["a-b チャットメモ2"]), "a-b チャットメモ3");
  assert.equal(chatMemoName("機能  開発", []), "機能 開発 チャットメモ1");
});
