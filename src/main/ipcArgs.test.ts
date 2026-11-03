import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingFolder, knownExtension, webContentsId } from "./ipcArgs.js";

test("IPC の引数の検査: 対応している拡張機能のキーと、埋め込みブラウザの ID だけを通す", () => {
  assert.equal(knownExtension("react-devtools"), "react-devtools");
  assert.throws(() => knownExtension("unknown"), /未対応/);
  assert.throws(() => knownExtension("toString"), /未対応/);
  assert.throws(() => knownExtension(1), /未対応/);
  assert.throws(() => knownExtension(undefined), /未対応/);
  assert.equal(webContentsId(12), 12);
  assert.throws(() => webContentsId("12"), /正しくありません/);
  assert.throws(() => webContentsId(undefined), /正しくありません/);
});

test("外部のターミナルで開くフォルダ: 絶対パスの、いまあるフォルダだけ", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-ipc-"));
  assert.equal(existingFolder(dir), dir);
  assert.throws(() => existingFolder("relative/dir"), /フォルダの場所が正しくありません/);
  assert.throws(() => existingFolder(42), /フォルダの場所が正しくありません/);
  assert.throws(() => existingFolder(path.join(dir, "nope")), /フォルダが見つかりません/);
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  assert.throws(() => existingFolder(file), /フォルダが見つかりません/);
});
