import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProviderStatus } from "@shared/types";
import { toolNotices } from "./toolNotices";

const claude = (installed: boolean, logged_in: boolean): ProviderStatus => ({ id: "claude", label: "Claude Code", implemented: true, installed, logged_in, detail: "d" });
const codex: ProviderStatus = { id: "codex", label: "Codex", implemented: false, installed: false, logged_in: false, detail: "対応予定" };

test("toolNotices: 使える・まだ確かめていないものは出さない（対応予定のプロバイダーも出さない）", () => {
  assert.deepEqual(toolNotices(undefined, undefined), []);
  assert.deepEqual(toolNotices([claude(true, true), codex], { installed: true, logged_in: true, detail: "ok" }), []);
});

test("toolNotices: 入っていない / ログインしていない Claude Code と gh", () => {
  const keys = (n: ReturnType<typeof toolNotices>) => n.map((x) => `${x.key}:${x.label}`);
  assert.deepEqual(keys(toolNotices([claude(true, false)], { installed: false, logged_in: false, detail: "none" })), ["claude:Claude Code に未ログイン", "github:gh が見つかりません"]);
  assert.deepEqual(keys(toolNotices([claude(false, false)], { installed: true, logged_in: false, detail: "x" })), ["claude:Claude Code が見つかりません", "github:gh に未ログイン"]);
});
