import { test } from "vitest";
import assert from "node:assert/strict";
import { PROVIDER_IDS, PROVIDER_LABELS, type ProviderId } from "@shared/settings/types";
import { PROVIDERS, providerCan, type ProviderCapability } from "./providers";

const pick = <K extends keyof (typeof PROVIDERS)["claude"]>(key: K) => Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id][key]]));
const can = (capability: ProviderCapability) => PROVIDER_IDS.filter((id: ProviderId) => providerCan(id, capability));

test("AI ごとの表は、前の別々の表と同じ値（名前・CLI・札の色と短い名前・入れ方）", () => {
  assert.deepEqual(Object.keys(PROVIDERS), [...PROVIDER_IDS]);
  assert.deepEqual(pick("label"), PROVIDER_LABELS);
  // 前のプロジェクトの設定の AI（PROVIDER_CLI）と対応予定の AI の起動の名前
  assert.deepEqual(pick("cli"), { claude: "claude", codex: "codex", copilot: "copilot", cursor: "agent", gemini: "agy" });
  // 前のチャットの AI の札（PROVIDER_HUES・CHIP_SHORT_NAMES）とアイコン（Claude だけ印）
  assert.deepEqual(pick("hue"), { claude: 20, codex: 160, copilot: 280, cursor: 210, gemini: 45 });
  assert.deepEqual(pick("short"), { claude: "Claude", codex: null, copilot: null, cursor: null, gemini: null });
  assert.deepEqual(pick("mark"), { claude: "claude", codex: "letter", copilot: "letter", cursor: "letter", gemini: "letter" });
  assert.equal(PROVIDERS.codex.installHint, "codex CLI が見つかりません（brew install codex）");
});

test("「できる・できない」は前の AI の名前の分かれ道と同じ", () => {
  // 砂場のオフ・砂場の診断・AI の切り替え（turn.ts・runner.ts・providerSwitch の claude・codex の if）
  for (const capability of ["sandbox_off", "sandbox_diagnostics", "switch", "pay_as_you_go"] as const) assert.deepEqual(can(capability), ["claude", "codex"]);
  // 画面の if（一覧の外のモデル・ファスト・推論の深さの既定・プランの使用枠は Claude、モデルの既定の深さは Codex）
  for (const capability of ["any_model", "fast_mode", "effort_default", "plan_usage"] as const) assert.deepEqual(can(capability), ["claude"]);
  assert.deepEqual(can("model_effort_default"), ["codex"]);
});

test("つながったかを確かめる先は AI ごと（Codex は OpenAI の API、ほかはまだ Anthropic の API）", () => {
  assert.equal(PROVIDERS.claude.reachability, "https://api.anthropic.com/");
  assert.equal(PROVIDERS.codex.reachability, "https://api.openai.com/");
});
