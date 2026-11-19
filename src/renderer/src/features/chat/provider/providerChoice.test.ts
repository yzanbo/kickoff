import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProviderStatus } from "@shared/types";
import { makeProviderStatus } from "@shared/testing/factories";
import { featureBlock, paysPerUse, providerChipName, providerPickBlock, providerSwitchBlock } from "./providerChoice";

/** Claude Code（分岐・ファイルを戻す・モデルの一覧ができる・サブスクで動かす） */
const status = (patch: Partial<ProviderStatus> = {}) =>
  makeProviderStatus("claude", { features: ["fork", "rewind_files", "models"], auth_mode: "subscription", has_api_key: false, ...patch });

test("providerPickBlock: 対応予定・確認中は選べず理由を返し、使える AI は null", () => {
  assert.equal(providerPickBlock("claude", status()), null);
  assert.equal(providerPickBlock("claude", undefined), "確認中…");
  assert.match(providerPickBlock("codex", status({ id: "codex", label: "Codex", implemented: false })) ?? "", /Codex は今後の対応予定/);
});

test("providerSwitchBlock: インストールとログイン・API キーを確認する", () => {
  assert.match(providerSwitchBlock(undefined) ?? "", /確認中/);
  assert.match(providerSwitchBlock(status({ installed: false })) ?? "", /利用できません/);
  assert.match(providerSwitchBlock(status({ logged_in: false })) ?? "", /ログイン/);
  assert.match(providerSwitchBlock(status({ auth_mode: "api_key", has_api_key: false })) ?? "", /API キー/);
  assert.equal(providerSwitchBlock(status({ auth_mode: "api_key", has_api_key: true, logged_in: false })), null);
  assert.equal(providerSwitchBlock(status()), null);
});

test("providerPickBlock: Gemini（Antigravity）は API キーを置いて API キーの設定にしたときだけ選べる", () => {
  const gemini = (patch: Partial<ProviderStatus>) => status({ id: "gemini", label: "Gemini（Antigravity）", ...patch });
  assert.match(providerPickBlock("gemini", gemini({})) ?? "", /API キーでだけ動きます/);
  assert.match(providerPickBlock("gemini", gemini({ auth_mode: "api_key" })) ?? "", /API キーでだけ/);
  assert.equal(providerPickBlock("gemini", gemini({ auth_mode: "api_key", has_api_key: true })), null);
});

test("featureBlock: できることにないものは理由の文、届いていない・できることを返さないコアなら止めない", () => {
  assert.equal(featureBlock(status(), "fork"), null);
  assert.equal(featureBlock(status({ label: "Codex" }), "subagent_log"), "Codex のチャットではサブエージェントの会話の記録は使えません");
  assert.equal(featureBlock(undefined, "fork"), null);
  assert.equal(featureBlock(status({ features: undefined }), "commands"), null);
});

test("paysPerUse / providerChipName: API キーで動かす AI には印を添える", () => {
  assert.equal(paysPerUse(status()), false);
  assert.equal(providerChipName("claude", status()), "Claude");
  assert.equal(paysPerUse(status({ auth_mode: "api_key" })), true);
  assert.equal(providerChipName("claude", status({ auth_mode: "api_key" })), "Claude · API キー");
  assert.equal(providerChipName("codex", undefined), "Codex");
});
