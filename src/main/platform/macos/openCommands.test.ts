import assert from "node:assert/strict";
import { test } from "node:test";
import { externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals } from "./openCommands.js";

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
