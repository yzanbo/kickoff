import assert from "node:assert/strict";
import { test } from "vitest";
import { codexInstallSource, codexLatestOf, compareVersions, isNewer, parseCodexVersion } from "./cliUpdates";

test("版の比べ方: 数字の段ごとに比べる（文字の順ではない）", () => {
  assert.ok(compareVersions("0.170.0", "0.169.0") > 0);
  assert.ok(compareVersions("0.99.0", "0.169.0") < 0);
  assert.equal(compareVersions("2.1.326", "2.1.326"), 0);
  assert.ok(compareVersions("2.1.326.1", "2.1.326") > 0);
});

test("Codex の入れ方: 実体のパスで Homebrew の cask・npm を見分け、分からなければ null", () => {
  assert.equal(codexInstallSource("/opt/homebrew/Caskroom/codex/0.169.0/bin/codex"), "brew_cask");
  assert.equal(codexInstallSource("/Users/a/.volta/tools/image/packages/@openai/codex/lib/node_modules/@openai/codex/bin/codex.js"), "npm");
  assert.equal(codexInstallSource("/usr/local/bin/codex"), null);
});

test("Codex の版: --version の出力と、聞いた先ごとの答えから読む", () => {
  assert.equal(parseCodexVersion("codex-cli 0.169.0\n"), "0.169.0");
  assert.equal(parseCodexVersion("WARNING: something\ncodex-cli 0.170.0-alpha.1"), "0.170.0-alpha.1");
  assert.equal(parseCodexVersion("codex"), null);
  assert.equal(codexLatestOf({ version: "0.170.0" }), "0.170.0");
  assert.equal(codexLatestOf({ version: "latest" }), null);
  assert.equal(codexLatestOf(null), null);
});

test("新しい版があるか: どちらかが読めなければ知らせない", () => {
  assert.equal(isNewer("0.170.0", "0.169.0"), true);
  assert.equal(isNewer("0.169.0", "0.169.0"), false);
  assert.equal(isNewer(null, "0.169.0"), false);
  assert.equal(isNewer("0.170.0", null), false);
});
