import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence } from "@shared/testing/factories";
import { isBeforeProviderSwitch, providerSwitchLine } from "./providerSwitch";

test("AI の切り替えを境に操作を制限し、切り替え元と先を表示する", () => {
  const ev = eventSequence();
  const first = ev("user", { text: "前" });
  const switched = ev("provider_switched", { from: "claude", to: "codex" });
  const after = ev("user", { text: "後" });
  const all = [first, switched, after];
  assert.equal(isBeforeProviderSwitch(all, first.id), true);
  assert.equal(isBeforeProviderSwitch(all, switched.id), false);
  assert.equal(isBeforeProviderSwitch(all, after.id), false);
  assert.equal(providerSwitchLine(switched.data), "Claude Code → Codex に切り替えました");
});
