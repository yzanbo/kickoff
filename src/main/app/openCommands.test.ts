import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingFolder, externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals, vscodeFileUrl } from "./openCommands.js";
import { tempDir } from "../../core/testing/tempDir.js";

test("外部のターミナルで開くフォルダ: いまあるフォルダだけ", () => {
  const dir = tempDir();
  assert.equal(existingFolder(dir), dir);
  assert.throws(() => existingFolder(path.join(dir, "nope")), /フォルダが見つかりません/);
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  assert.throws(() => existingFolder(file), /フォルダが見つかりません/);
});

test("外部のターミナル: アプリごとの作業フォルダの渡し方、入っているものだけを出す", () => {
  assert.deepEqual(externalTerminalArgs("terminal", "/w"), ["-a", "Terminal", "/w"]);
  assert.deepEqual(externalTerminalArgs("ghostty", "/w"), ["-na", "Ghostty", "--args", "--working-directory=/w"]);
  assert.deepEqual(externalTerminalArgs("iterm", "/w"), ["-a", "iTerm", "/w"]);
  const present = new Set(["/Applications/Ghostty.app", "/h/Applications/Warp.app"]);
  assert.deepEqual(installedTerminals("/h", (p) => present.has(p)), ["terminal", "ghostty", "warp"]);
});

test("外部のブラウザ: ページは http(s) だけ渡し、なければアプリを開くだけ、入っているものだけを出す", () => {
  assert.deepEqual(externalBrowserArgs("brave", "https://example.com/"), ["-a", "Brave Browser", "https://example.com/"]);
  assert.deepEqual(externalBrowserArgs("safari", "file:///etc/passwd"), ["-a", "Safari"]);
  assert.deepEqual(externalBrowserArgs("chrome"), ["-a", "Google Chrome"]);
  const present = new Set(["/Applications/Google Chrome.app", "/h/Applications/Arc.app"]);
  assert.deepEqual(installedBrowsers("/h", (p) => present.has(p)), ["chrome", "safari", "arc"]);
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
