import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { adoptLegacyMemosDir, defaultMemosDir, legacyMemosDir, movedPath } from "./defaultDir.js";

test("defaultMemosDir: アプリ名を空白のない小文字にしたフォルダ（開発版は kickoff-dev）", () => {
  assert.equal(defaultMemosDir("/data/Kickoff", "/Users/me/Documents"), "/Users/me/Documents/kickoff");
  assert.equal(defaultMemosDir("/data/Kickoff Dev", "/Users/me/Documents"), "/Users/me/Documents/kickoff-dev");
  assert.equal(legacyMemosDir("/data/Kickoff Dev", "/Users/me/Documents"), "/Users/me/Documents/Kickoff Dev メモ");
});

test("adoptLegacyMemosDir: 前の既定のフォルダを中身ごと引き継ぎ、新しいフォルダがもうあれば触らない", () => {
  const docs = tempDir();
  const from = path.join(docs, "Kickoff メモ");
  const to = path.join(docs, "kickoff");
  // 前のフォルダがなければ何もしない
  assert.equal(adoptLegacyMemosDir(from, to), false);
  fs.mkdirSync(path.join(from, "proj"), { recursive: true });
  fs.writeFileSync(path.join(from, "proj", "a.md"), "# a\n");
  assert.equal(adoptLegacyMemosDir(from, to), true);
  assert.equal(fs.readFileSync(path.join(to, "proj", "a.md"), "utf8"), "# a\n");
  assert.equal(fs.existsSync(from), false);
  // 新しいフォルダがもうあれば、前のフォルダがあっても混ぜない
  fs.mkdirSync(from);
  assert.equal(adoptLegacyMemosDir(from, to), false);
  assert.equal(fs.existsSync(from), true);
});

test("movedPath: 引き継いだフォルダの中を指すパスだけを付け替える", () => {
  assert.equal(movedPath("/d/Kickoff メモ/proj", "/d/Kickoff メモ", "/d/kickoff"), "/d/kickoff/proj");
  assert.equal(movedPath("/d/Kickoff メモ", "/d/Kickoff メモ", "/d/kickoff"), "/d/kickoff");
  assert.equal(movedPath("/d/ほか", "/d/Kickoff メモ", "/d/kickoff"), null);
});
