// 確かめた CLI・SDK の版（各実装の外の形のファイルの TESTED_VERSION）。SDK を上げたら、外の形を確かめ直してから値を直す
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { TESTED_VERSION as CLAUDE_SDK } from "./claude/wire";
import { TESTED_VERSION as CODEX } from "./codex/protocol";
import { TESTED_VERSION as AGY } from "./gemini/provider";

test("Claude Agent SDK の確かめた版は、入っている SDK の版と同じ", () => {
  const installed = (JSON.parse(readFileSync("node_modules/@anthropic-ai/claude-agent-sdk/package.json", "utf8")) as { version: string }).version;
  assert.equal(CLAUDE_SDK, installed);
});

test("Codex・agy の確かめた版は x.y.z の形", () => {
  for (const version of [CODEX, AGY]) assert.match(version, /^\d+\.\d+\.\d+$/);
});
