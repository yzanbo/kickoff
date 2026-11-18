import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProviderId, ProviderStatus, ServiceUsage } from "@shared/types";
import { usageGroups } from "./usageGroups";

const status = (id: ProviderId, patch: Partial<ProviderStatus> = {}): ProviderStatus => ({
  id,
  label: id,
  implemented: true,
  installed: true,
  logged_in: true,
  detail: "",
  ...patch,
});

const service = (id: ServiceUsage["id"], patch: Partial<ServiceUsage> = {}): ServiceUsage => ({
  id,
  label: id,
  status: "ok",
  plan: "plus",
  account: null,
  windows: [{ key: "primary", label: "5時間", utilization: 10, resets_at: null }],
  notes: [],
  fetched_at: "2026-11-18T00:00:00Z",
  ...patch,
});

const kinds = (groups: ReturnType<typeof usageGroups>) => groups.map((g) => `${g.provider}:${g.kind}`);

test("Claude はいつも出し、Codex は枠を読めるときだけ並べる", () => {
  const statuses = [status("claude"), status("codex")];
  assert.deepEqual(kinds(usageGroups({ foreground: null, statuses, services: [service("codex")] })), ["claude:plan", "codex:service"]);
  assert.deepEqual(kinds(usageGroups({ foreground: null, statuses, services: [service("codex", { status: "unavailable" })] })), ["claude:plan"]);
  // 使用状況がまだ届いていなくても Claude は出す
  assert.deepEqual(kinds(usageGroups({ foreground: "claude", statuses: undefined, services: undefined })), ["claude:plan"]);
});

test("前に出しているチャットの AI は、枠を読めなくても札だけは出す", () => {
  assert.deepEqual(kinds(usageGroups({ foreground: "codex", statuses: undefined, services: undefined })), ["claude:plan", "codex:missing"]);
  assert.deepEqual(kinds(usageGroups({ foreground: "copilot", statuses: undefined, services: [service("copilot")] })), ["claude:plan", "copilot:service"]);
  assert.deepEqual(kinds(usageGroups({ foreground: "cursor", statuses: undefined, services: [] })), ["claude:plan", "cursor:missing"]);
});

test("API キーで動かす AI は「使った分の支払い」。Codex はキーを置いたときか前に出しているときだけ", () => {
  const apiKey = { auth_mode: "api_key" as const };
  assert.deepEqual(kinds(usageGroups({ foreground: null, statuses: [status("claude", apiKey)], services: [] })), ["claude:pay"]);
  assert.deepEqual(kinds(usageGroups({ foreground: null, statuses: [status("codex", { ...apiKey, has_api_key: true })], services: [] })), ["claude:plan", "codex:pay"]);
  assert.deepEqual(kinds(usageGroups({ foreground: null, statuses: [status("codex", { ...apiKey, has_api_key: false })], services: [] })), ["claude:plan"]);
  assert.deepEqual(kinds(usageGroups({ foreground: "gemini", statuses: [status("gemini", apiKey)], services: [] })), ["claude:plan", "gemini:pay"]);
});
