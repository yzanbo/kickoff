import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, vi } from "vitest";
import { tempDir } from "../src/foundation/core/testing/tempDir.ts";
import { checkAgentUpdates, hookContext, hookOutput, needsFetch, shouldNotify } from "./check-agent-updates.mjs";

const at = (s) => Date.parse(s);

test("聞き直すのは、覚えがないか 24 時間たったときだけ", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(needsFetch({}, now), true);
  assert.equal(needsFetch({ latest: "2.1.322", checked_at: "2026-11-10T01:00:00Z" }, now), false);
  assert.equal(needsFetch({ latest: "2.1.322", checked_at: "2026-11-09T11:59:00Z" }, now), true);
});

test("失敗したあとは 1 時間あけて聞き直す。聞く先（Codex の入れ方）が変わったらすぐ聞き直す", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(needsFetch({ failed_at: "2026-11-10T11:30:00Z" }, now), false);
  assert.equal(needsFetch({ failed_at: "2026-11-10T10:59:00Z" }, now), true);
  const fresh = { key: "brew_cask", latest: "0.169.0", checked_at: "2026-11-10T11:00:00Z" };
  assert.equal(needsFetch(fresh, now, "brew_cask"), false);
  assert.equal(needsFetch(fresh, now, "npm"), true);
});

test("手元より新しい版があるときだけ知らせる", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", now, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.322", now, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.323", latest: "2.1.322", now, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.322", latest: undefined, now, hook: true }), false);
});

test("フックでは同じ版を 1 日 1 回まで。翌日・別の版ならまた知らせる。ターミナルではいつも知らせる", () => {
  const notified = { version: "2.1.323", at: new Date(2026, 10, 10, 9, 0).toISOString() };
  const later = new Date(2026, 10, 10, 9, 30).getTime();
  const nextDay = new Date(2026, 10, 11, 9, 0).getTime();
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: later, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: nextDay, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.324", notified, now: later, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: later, hook: false }), true);
});

test("フックの出力は SessionStart の additionalContext で、知らせる AI の文をつなぐ", () => {
  const out = JSON.parse(hookOutput([hookContext("claude", "2.1.322", "2.1.323"), hookContext("codex", "0.169.0", "0.170.0", "brew upgrade --cask codex", "Homebrew の cask")]));
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /2\.1\.322 → 最新 2\.1\.323/);
  assert.match(out.hookSpecificOutput.additionalContext, /Codex に新しい版.*0\.169\.0 → 最新 0\.170\.0.*brew upgrade --cask codex/);
});

test("Codex: 入れ方の聞く先に問い合わせ、新しい版があればフックで知らせて 1 日 1 回までに覚える", async () => {
  const root = tempDir();
  const sdk = path.join(root, "node_modules", "@anthropic-ai", "claude-agent-sdk");
  mkdirSync(sdk, { recursive: true });
  writeFileSync(path.join(sdk, "package.json"), JSON.stringify({ claudeCodeVersion: "2.1.326" }));
  const codex = path.join(root, "Caskroom", "codex", "0.169.0", "bin", "codex");
  mkdirSync(path.dirname(codex), { recursive: true });
  writeFileSync(codex, "#!/bin/sh\necho 'codex-cli 0.169.0'\n");
  chmodSync(codex, 0o755);
  const asked = [];
  vi.stubGlobal("fetch", async (url) => {
    asked.push(String(url));
    const body = String(url).includes("formulae.brew.sh") ? { version: "0.170.0" } : { claudeCodeVersion: "2.1.326" };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const now = at("2026-11-18T03:00:00Z");
  const out = await checkAgentUpdates({ hook: true, start: root, now, codexPath: codex });
  assert.ok(out);
  const context = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(context, /Codex に新しい版.*0\.169\.0 → 最新 0\.170\.0/);
  assert.doesNotMatch(context, /Claude Code/);
  assert.ok(asked.includes("https://formulae.brew.sh/api/cask/codex.json"));
  // 同じ日の 2 回目のフックは黙る（ターミナルの 1 行は出す）
  assert.equal(await checkAgentUpdates({ hook: true, start: root, now: now + 60_000, codexPath: codex }), null);
  assert.match(await checkAgentUpdates({ start: root, now: now + 60_000, codexPath: codex }), /Codex 0\.170\.0 が出ています（いま 0\.169\.0）/);
});
