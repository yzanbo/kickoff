import assert from "node:assert/strict";
import { test } from "vitest";
import { makeProviderStatus } from "@shared/ai/testing";
import { EFFORT_UNSET_LABEL } from "@/features/ai/ui/options/AiOptions";
import { defaultsCardProviders, inheritLabels, offersProviderDefaultModel, showsFast } from "./chatDefaultsModel";

test("プロジェクトの AI の既定: 「アプリの設定に従う」の横にアプリの設定の値を出し、アプリの設定が届くまでは「…」", () => {
  const app = { model: "opus", effort: null, permission_mode: "auto" as const, fast_mode: true };
  assert.deepEqual(inheritLabels("claude", [], app), { model: "opus", effort: EFFORT_UNSET_LABEL, permission: "Auto mode", fast: "使う" });
  assert.equal(inheritLabels("claude", [], { ...app, fast_mode: false }).fast, "使わない");
  assert.deepEqual(inheritLabels("codex", [], null), { model: "…", effort: "…", permission: "…", fast: "…" });
});

test("Claude Code は「その AI の既定のモデル」を選べず、ファストモードを持つ。Codex は既定のモデルを選べ、ファストモードを持たない（対応するモデルがない）", () => {
  assert.equal(offersProviderDefaultModel("claude"), false);
  assert.equal(offersProviderDefaultModel("codex"), true);
  assert.equal(showsFast("claude", []), true);
  assert.equal(showsFast("codex", []), false);
});

test("新しいチャットの既定: Claude Code と、Kickoff のチャットで使えるほかの AI だけを並べる（状態が届く前は Claude Code だけ）", () => {
  const statuses = [makeProviderStatus("codex", { implemented: true }), makeProviderStatus("gemini", { implemented: false })];
  assert.deepEqual(defaultsCardProviders(statuses), ["claude", "codex"]);
  assert.deepEqual(defaultsCardProviders(undefined), ["claude"]);
});
