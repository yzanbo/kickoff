import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { BusEvent } from "@shared/types";
import { matchRecord } from "@/foundation/core/testing/record";

/** SSE（Bus の知らせ）の種類のすべて（satisfies なので、種類を足したら型検査が足し忘れを教える） */
const SSE_TYPES = {
  project: true,
  project_deleted: true,
  chat: true,
  ai_notice: true,
  chat_deleted: true,
  group: true,
  group_deleted: true,
  snippet: true,
  snippet_deleted: true,
  chat_event: true,
  chat_events_deleted: true,
  chat_delta: true,
  chat_subagent: true,
  chat_command_output: true,
  chat_live: true,
  approval: true,
  approval_resolved: true,
  settings: true,
  usage: true,
  codex_credits: true,
  voice_model: true,
  memos: true,
  worktrees_changed: true,
  worktree_prs: true,
  chat_image_hosts: true,
  db_connections: true,
  db_connection_state: true,
  docker_changed: true,
  ci_failed: true,
  open_view: true,
  chat_draft: true,
  ports_changed: true,
  pairing: true,
  devices: true,
  trash: true,
  provider_login: true,
} satisfies Record<BusEvent["type"], true>;

/** まだコアのテストに名前が出ない種類（減らすだけ。テストを足したら消す） */
const PENDING: readonly string[] = [];

test("SSE の種類の記録（種類を機能へ配っても変わらない）", async () => {
  await matchRecord("core/sse-types.json", Object.keys(SSE_TYPES).sort());
});

test("SSE のどの種類も、コアのテストのどこかで名前が出る（まだのものは PENDING だけ）", () => {
  const self = "src/app/core/sseCoverage.test.ts";
  const coreTests = ["src/foundation/core/*.test.ts", "src/features/*/core/*.test.ts", "src/features/*/worker/*.test.ts", "src/app/core/*.test.ts"];
  const files = execFileSync("git", ["ls-files", ...coreTests], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && f !== self);
  const texts = files.map((f) => readFileSync(f, "utf8"));
  const seen = (type: string) => texts.some((text) => text.includes(`"${type}"`));
  const missing = Object.keys(SSE_TYPES).filter((type) => !seen(type));
  assert.deepEqual(
    missing.filter((type) => !PENDING.includes(type)),
    [],
    "コアのテストに名前が出ない種類がある（その種類が届くことを確かめるテストを足す）",
  );
  assert.deepEqual(
    PENDING.filter((type) => seen(type)),
    [],
    "テストに名前が出てきた種類は PENDING から消す",
  );
});
