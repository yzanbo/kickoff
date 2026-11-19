import { test } from "vitest";
import assert from "node:assert/strict";
import { isUnsandboxedCommand } from "./sandboxExit";

const PATTERNS = ["brew install:*", "npm run dev:*", "npx electron:*"];

test("isUnsandboxedCommand: 決まったコマンドだけを丸ごと当てる（Codex の /bin/zsh -lc '…' の包みは中を見る）", () => {
  assert.equal(isUnsandboxedCommand("/bin/zsh -lc 'brew install ffmpeg'", PATTERNS), true);
  assert.equal(isUnsandboxedCommand("brew install", PATTERNS), true);
  assert.equal(isUnsandboxedCommand("npm run dev", PATTERNS), true);
  // 似た名前・前置き・つなぎ・リダイレクト・置き換えは当てない
  assert.equal(isUnsandboxedCommand("brew installer", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("/bin/zsh -lc 'touch ~/x'", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("FOO=1 npm run dev", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("/bin/zsh -lc 'brew install x && rm -rf ~'", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("npm run dev > out.log", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("brew install $(cat list)", PATTERNS), false);
  assert.equal(isUnsandboxedCommand("brew install ffmpeg", []), false);
});
