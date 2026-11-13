import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingFolder, vscodeFileUrl } from "./openCommands.js";
import { tempDir } from "../../core/testing/tempDir.js";

test("外部のターミナルで開くフォルダ: いまあるフォルダだけ", () => {
  const dir = tempDir();
  assert.equal(existingFolder(dir), dir);
  assert.throws(() => existingFolder(path.join(dir, "nope")), /フォルダが見つかりません/);
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  assert.throws(() => existingFolder(file), /フォルダが見つかりません/);
});

test("VS Code で開く URL: パスを区切りごとに符号化し（# と ? も）、行は正の数のときだけ添える", () => {
  assert.equal(vscodeFileUrl("/repo/src/a.ts"), "vscode://file/repo/src/a.ts");
  assert.equal(vscodeFileUrl("/repo/src/a.ts", 12), "vscode://file/repo/src/a.ts:12");
  assert.equal(vscodeFileUrl("/repo/src/a.ts", 0), "vscode://file/repo/src/a.ts");
  // 以前は encodeURI で、# と ? が URL の断片・問い合わせとして読まれて開けなかった
  assert.equal(vscodeFileUrl("/repo/#notes/what?.md", 3), "vscode://file/repo/%23notes/what%3F.md:3");
  assert.equal(vscodeFileUrl("/repo/仕様 書/a b.md"), "vscode://file/repo/%E4%BB%95%E6%A7%98%20%E6%9B%B8/a%20b.md");
  assert.equal(new URL(vscodeFileUrl("/repo/#notes/what?.md")).hash, "");
});
