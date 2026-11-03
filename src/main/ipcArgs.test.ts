import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existingFolder, externalTerminalArgs, installedTerminals, knownExtension, knownTerminal, notificationIdOf, notifyArgs, runOfNotificationId, webContentsId } from "./ipcArgs.js";

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

test("通知の指定: タイトルは必須、長すぎる文は切り、チャットは両方の ID がそろったときだけ", () => {
  assert.throws(() => notifyArgs({ title: " " }));
  assert.throws(() => notifyArgs(null));
  assert.deepEqual(notifyArgs({ title: "完了", body: "x".repeat(600), projectId: 5, runId: 14 }), {
    title: "完了",
    body: "x".repeat(500),
    run: { projectId: 5, runId: 14 },
  });
  assert.deepEqual(notifyArgs({ title: "テスト", projectId: 5 }), { title: "テスト", body: "" });
  assert.deepEqual(notifyArgs({ title: "テスト", projectId: 5, runId: -1 }), { title: "テスト", body: "" });
});

test("通知の ID: チャットを埋め込み、起動し直したあとに押されても読み戻せる（毎回変える）", () => {
  const id = notificationIdOf({ projectId: 5, runId: 14 }, 1000);
  assert.equal(id, "kickoff-run:5:14:1000");
  assert.deepEqual(runOfNotificationId(id), { projectId: 5, runId: 14 });
  assert.notEqual(notificationIdOf({ projectId: 5, runId: 14 }, 1001), id);
  assert.equal(runOfNotificationId(notificationIdOf(undefined, 1000)), undefined);
  assert.equal(runOfNotificationId("other"), undefined);
});
