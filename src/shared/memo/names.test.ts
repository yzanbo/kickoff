import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMemoName, datedMemoName, defaultMemosFolderName, memoDatePrefixLength, projectMemoFolder, safeMemoName, uniqueMemoName } from "./names";

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

test("projectMemoFolder: 使える名前にし、ほかのプロジェクト（別の場所を指すもの・自分を除く）のフォルダ名と重なれば「名前-2」", () => {
  const projects = [
    { id: 1, memo_folder: "app", memo_path: null },
    { id: 2, memo_folder: "App-2", memo_path: "/elsewhere" },
    { id: 3, memo_folder: null, memo_path: null },
  ];
  assert.equal(projectMemoFolder("a/b", projects), "a-b");
  assert.equal(projectMemoFolder("app", projects), "app-2");
  assert.equal(projectMemoFolder("app", projects, 1), "app");
});

test("datedMemoName: 手元の日付を頭に付ける（月・日は 2 桁）", () => {
  assert.equal(datedMemoName("無題のメモ", new Date(2026, 0, 5, 23, 59)), "2026-01-05 無題のメモ");
  assert.equal(datedMemoName("無題のメモ", new Date(2026, 10, 9)), "2026-11-09 無題のメモ");
});

test("memoDatePrefixLength: 頭の日付と空白の長さ（なければ 0）", () => {
  assert.equal(memoDatePrefixLength("2026-11-09 無題のメモ"), 11);
  assert.equal(memoDatePrefixLength("2026-11-09 無題のメモ-2"), 11);
  assert.equal(memoDatePrefixLength("無題のメモ"), 0);
  assert.equal(memoDatePrefixLength("2026-11-09"), 0);
  assert.equal(memoDatePrefixLength("2026-1-9 メモ"), 0);
});
