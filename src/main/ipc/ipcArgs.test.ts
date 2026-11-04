import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingFolder, externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals, knownBrowser, knownExtension, knownTerminal, notificationIdOf, notifyArgs, chatOfNotificationId, vscodeFileUrl, webContentsId } from "./ipcArgs.js";

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

test("外部のターミナル: 知らないものは Terminal.app、アプリごとの作業フォルダの渡し方、入っているものだけを出す", () => {
  assert.equal(knownTerminal("ghostty"), "ghostty");
  assert.equal(knownTerminal("nope"), "terminal");
  assert.equal(knownTerminal(undefined), "terminal");
  assert.deepEqual(externalTerminalArgs("terminal", "/w"), ["-a", "Terminal", "/w"]);
  assert.deepEqual(externalTerminalArgs("ghostty", "/w"), ["-na", "Ghostty", "--args", "--working-directory=/w"]);
  assert.deepEqual(externalTerminalArgs("iterm", "/w"), ["-a", "iTerm", "/w"]);
  const present = new Set(["/Applications/Ghostty.app", "/h/Applications/Warp.app"]);
  assert.deepEqual(installedTerminals("/h", (p) => present.has(p)), ["terminal", "ghostty", "warp"]);
});

test("外部のブラウザ: 知らないものは Chrome、ページは http(s) だけ渡し、なければアプリを開くだけ、入っているものだけを出す", () => {
  assert.equal(knownBrowser("arc"), "arc");
  assert.equal(knownBrowser("nope"), "chrome");
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

test("通知の指定: タイトルは必須、長すぎる文は切り、チャットは両方の ID がそろったときだけ", () => {
  assert.throws(() => notifyArgs({ title: " " }));
  assert.throws(() => notifyArgs(null));
  assert.deepEqual(notifyArgs({ title: "完了", body: "x".repeat(600), projectId: 5, chatId: 14 }), {
    title: "完了",
    body: "x".repeat(500),
    chat: { projectId: 5, chatId: 14 },
  });
  assert.deepEqual(notifyArgs({ title: "テスト", projectId: 5 }), { title: "テスト", body: "" });
  assert.deepEqual(notifyArgs({ title: "テスト", projectId: 5, chatId: -1 }), { title: "テスト", body: "" });
});

test("通知の ID: チャットを埋め込み、起動し直したあとに押されても読み戻せる（毎回変える）", () => {
  const id = notificationIdOf({ projectId: 5, chatId: 14 }, 1000);
  assert.equal(id, "kickoff-chat:5:14:1000");
  assert.deepEqual(chatOfNotificationId(id), { projectId: 5, chatId: 14 });
  assert.notEqual(notificationIdOf({ projectId: 5, chatId: 14 }, 1001), id);
  assert.equal(chatOfNotificationId(notificationIdOf(undefined, 1000)), undefined);
  assert.equal(chatOfNotificationId("other"), undefined);
});
