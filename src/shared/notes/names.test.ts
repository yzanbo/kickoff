import assert from "node:assert/strict";
import { test } from "vitest";
import { chatNoteName, datedNoteName, defaultNotesFolderName, noteDatePrefixLength, projectNoteFolder, safeNoteName, uniqueNoteName } from "./names";

test("safeNoteName: ファイル名に使えない文字を置き換え、隠しファイルにしない", () => {
  assert.equal(safeNoteName("a/b:c\\d"), "a-b-c-d");
  // 続く空白・改行は 1 つの空白に（名前の空白はそのまま使う）
  assert.equal(safeNoteName("  ..設定  ノート \n"), "設定 ノート");
  assert.equal(safeNoteName("   "), "無題のノート");
  assert.equal([...safeNoteName("あ".repeat(200))].length, 80);
  // 切った端に空白が来ても、終わりに空白を残さない
  assert.equal(safeNoteName(`${"あ".repeat(79)} い`), "あ".repeat(79));
});

test("defaultNotesFolderName: アプリ名を小文字にして空白を入れない", () => {
  assert.equal(defaultNotesFolderName("Kickoff"), "kickoff");
  assert.equal(defaultNotesFolderName("Kickoff Dev"), "kickoff-dev");
  assert.equal(defaultNotesFolderName(" My  App "), "my-app");
});

test("uniqueNoteName: 重なれば番号を付ける（大文字・小文字は同じとみなす）", () => {
  assert.equal(uniqueNoteName("ノート", []), "ノート");
  assert.equal(uniqueNoteName("Note", ["note", "Note-2"]), "Note-3");
});

test("chatNoteName: 同じチャットのノートの次の番号", () => {
  assert.equal(chatNoteName("ログイン画面", []), "ログイン画面 チャットノート1");
  assert.equal(chatNoteName("ログイン画面", ["ログイン画面 チャットノート1", "ログイン画面 チャットノート3", "ほか チャットノート9"]), "ログイン画面 チャットノート4");
  // 名前に使えない文字はそろえてから比べる。空白はそのまま
  assert.equal(chatNoteName("a/b", ["a-b チャットノート2"]), "a-b チャットノート3");
  assert.equal(chatNoteName("機能  開発", []), "機能 開発 チャットノート1");
});

test("projectNoteFolder: 使える名前にし、ほかのプロジェクト（別の場所を指すもの・自分を除く）のフォルダ名と重なれば「名前-2」", () => {
  const projects = [
    { id: 1, note_folder: "app", note_path: null },
    { id: 2, note_folder: "App-2", note_path: "/elsewhere" },
    { id: 3, note_folder: null, note_path: null },
  ];
  assert.equal(projectNoteFolder("a/b", projects), "a-b");
  assert.equal(projectNoteFolder("app", projects), "app-2");
  assert.equal(projectNoteFolder("app", projects, 1), "app");
});

test("datedNoteName: 手元の日付を頭に付ける（月・日は 2 桁）", () => {
  assert.equal(datedNoteName("無題のノート", new Date(2026, 0, 5, 23, 59)), "2026-01-05 無題のノート");
  assert.equal(datedNoteName("無題のノート", new Date(2026, 10, 9)), "2026-11-09 無題のノート");
});

test("noteDatePrefixLength: 頭の日付と空白の長さ（なければ 0）", () => {
  assert.equal(noteDatePrefixLength("2026-11-09 無題のノート"), 11);
  assert.equal(noteDatePrefixLength("2026-11-09 無題のノート-2"), 11);
  assert.equal(noteDatePrefixLength("無題のノート"), 0);
  assert.equal(noteDatePrefixLength("2026-11-09"), 0);
  assert.equal(noteDatePrefixLength("2026-1-9 ノート"), 0);
});
