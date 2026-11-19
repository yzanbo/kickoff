import assert from "node:assert/strict";
import { test } from "vitest";
import { eventSequence } from "@shared/foundation/testing/factories";
import { isBeforeProviderSwitch, providerAtEvent, providerBoundaries, providerSwitchLine } from "./providerSwitch";

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

test("旧チャットの返答は元の AI、複数回切り替えた返答はその時点の AI として表示する", () => {
  const ev = eventSequence();
  const old = ev("text", { text: "旧" });
  const first = ev("provider_switched", { from: "claude", to: "codex" });
  const middle = ev("text", { text: "途中" });
  const second = ev("provider_switched", { from: "codex", to: "claude" });
  const latest = ev("text", { text: "最新" });
  const bounds = providerBoundaries([old, first, middle, second, latest]);
  assert.equal(providerAtEvent([], old.id, "claude"), "claude");
  assert.equal(providerAtEvent(bounds, old.id, "claude"), "claude");
  assert.equal(providerAtEvent(bounds, middle.id, "claude"), "codex");
  assert.equal(providerAtEvent(bounds, latest.id, "claude"), "claude");
});
