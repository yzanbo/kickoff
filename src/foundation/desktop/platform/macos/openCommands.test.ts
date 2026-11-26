import assert from "node:assert/strict";
import { test } from "vitest";
import { externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals } from "./openCommands";

test("外部のターミナル: アプリごとの作業フォルダの渡し方、入っているものだけを出す", () => {
  assert.deepEqual(externalTerminalArgs("terminal", "/w"), ["-a", "Terminal", "/w"]);
  assert.deepEqual(externalTerminalArgs("ghostty", "/w"), ["-na", "Ghostty", "--args", "--working-directory=/w"]);
  assert.deepEqual(externalTerminalArgs("iterm", "/w"), ["-a", "iTerm", "/w"]);
  const present = new Set(["/Applications/Ghostty.app", "/h/Applications/Warp.app"]);
  assert.deepEqual(installedTerminals("/h", (p) => present.has(p)), ["terminal", "ghostty", "warp"]);
});

test("外部のブラウザ: ページは http(s) だけ渡し、なければ空の新しいタブ、入っているものだけを出す", () => {
  assert.deepEqual(externalBrowserArgs("brave", "https://example.com/"), ["-a", "Brave Browser", "https://example.com/"]);
  assert.deepEqual(externalBrowserArgs("safari", "file:///etc/passwd"), ["-a", "Safari", "about:blank"]);
  assert.deepEqual(externalBrowserArgs("chrome"), ["-a", "Google Chrome", "about:blank"]);
  // 読み直した形を渡し、改行・空白・見えない文字を含むものは渡さない（ブラウザは改行を捨てて別の行き先と読む）
  assert.deepEqual(externalBrowserArgs("chrome", "HTTPS://Example.com"), ["-a", "Google Chrome", "https://example.com/"]);
  for (const url of ["https://exa\nmple.com", "https://example.com/a b", "https://exa\u200bmple.com"]) assert.deepEqual(externalBrowserArgs("chrome", url), ["-a", "Google Chrome", "about:blank"], url);
  const present = new Set(["/Applications/Google Chrome.app", "/h/Applications/Arc.app"]);
  assert.deepEqual(installedBrowsers("/h", (p) => present.has(p)), ["chrome", "safari", "arc"]);
});
