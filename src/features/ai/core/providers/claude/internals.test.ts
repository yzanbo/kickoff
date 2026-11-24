import assert from "node:assert/strict";
import { test } from "vitest";
import { autoCompactEnv, claudeProjectsDir } from "./internals";

test("autoCompactEnv: 決めたときだけ CLAUDE_AUTOCOMPACT_PCT_OVERRIDE を渡す", () => {
  assert.deepEqual(autoCompactEnv(50), { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" });
  assert.deepEqual(autoCompactEnv(null), {});
});

test("会話記録のフォルダは CLAUDE_CONFIG_DIR があればその中の projects", () => {
  assert.equal(claudeProjectsDir({ CLAUDE_CONFIG_DIR: "/c" }), "/c/projects");
});
