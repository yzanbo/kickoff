import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { providerSwitchMenu } from "./ProviderSwitchChip";

test("Claude Code・Codex は切り替えを選べ、作業中・アーカイブ中・切り替え中は選べない", () => {
  const menu = (provider: "claude" | "codex" | "cursor", state = { busy: false, switching: false }, archived = false) => providerSwitchMenu(makeChat(1, { provider, archived_at: archived ? "2026-11-18T00:00:00Z" : null }), [], state);
  assert.deepEqual(Object.keys(menu("claude")?.labels ?? {}), ["claude", "codex"]);
  assert.equal(menu("codex")?.inactive, null);
  assert.equal(menu("cursor"), null);
  assert.match(menu("claude", { busy: true, switching: false })?.inactive ?? "", /作業が終わってから/);
  assert.match(menu("claude", { busy: false, switching: true })?.inactive ?? "", /切り替え中/);
  assert.match(menu("codex", undefined, true)?.inactive ?? "", /アーカイブ済み/);
  // 状態が届いていない AI は理由付きで選べない（いまの AI は選べる）
  assert.equal(menu("claude")?.disabled.claude, undefined);
  assert.match(menu("claude")?.disabled.codex ?? "", /確認中/);
});
