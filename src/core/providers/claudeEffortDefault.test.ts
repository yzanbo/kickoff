import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { claudeEffortDefault } from "./claudeEffortDefault.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-effort-"));
const write = (dir: string, file: string, value: unknown) => {
  fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", file), typeof value === "string" ? value : JSON.stringify(value));
};

test("既定の深さ: 環境変数 → 作業フォルダの local → project → ユーザーの設定の順。各設定はモデルごと → 全体の順", async () => {
  const cwd = tmp();
  const home = tmp();
  write(home, "settings.json", { effortLevel: "low", modelSettings: { "claude-opus-5": { effortLevel: "xhigh" } } });
  // ユーザーの設定: モデルごとの設定があればそれ、なければ全体
  assert.deepEqual(await claudeEffortDefault("claude-opus-5", cwd, {}, home), { effort: "xhigh", source: "user" });
  assert.deepEqual(await claudeEffortDefault("claude-opus-5-5", cwd, {}, home), { effort: "low", source: "user" });
  // 作業フォルダの設定が先
  write(cwd, "settings.json", { effortLevel: "medium" });
  assert.deepEqual(await claudeEffortDefault("claude-opus-5", cwd, {}, home), { effort: "medium", source: "project" });
  write(cwd, "settings.local.json", { modelSettings: { "claude-opus-5": { effortLevel: "high" } } });
  assert.deepEqual(await claudeEffortDefault("claude-opus-5", cwd, {}, home), { effort: "high", source: "local" });
  assert.deepEqual(await claudeEffortDefault("claude-sonnet-5", cwd, {}, home), { effort: "medium", source: "project" });
  // 環境変数がいちばん先（知らない値は飛ばす）
  assert.deepEqual(await claudeEffortDefault("claude-opus-5", cwd, { CLAUDE_CODE_EFFORT_LEVEL: "max" }, home), { effort: "max", source: "env" });
  assert.deepEqual(await claudeEffortDefault("claude-opus-5", cwd, { CLAUDE_CODE_EFFORT_LEVEL: "unset" }, home), { effort: "high", source: "local" });
});

test("既定の深さ: どこにもない・壊れた設定・知らない値は飛ばし、なければモデルの既定（null）", async () => {
  const cwd = tmp();
  const home = tmp();
  write(cwd, "settings.local.json", "{ 壊れた");
  write(cwd, "settings.json", { effortLevel: "turbo" });
  assert.deepEqual(await claudeEffortDefault(null, cwd, {}, home), { effort: null, source: null });
});
