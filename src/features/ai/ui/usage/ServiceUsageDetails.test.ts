import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PayAsYouGo, ProviderUsage } from "@shared/ai/usage";
import { ServiceUsageDetails } from "./ServiceUsageDetails";

const service = (patch: Partial<ProviderUsage> = {}): ProviderUsage => ({
  provider: "codex",
  status: "ok",
  plan: "plus",
  account: "test@example.com",
  windows: [
    { key: "primary", label: "5時間", utilization: 9, resets_at: "2030-01-01T12:00:00Z" },
    { key: "secondary", label: "週", utilization: 1, resets_at: "2030-01-05T12:00:00Z" },
  ],
  notes: ["クレジット残り 150"],
  pay_as_you_go: null,
  fetched_at: "2026-11-17T00:00:00Z",
  ...patch,
});

const credits = (patch: Partial<PayAsYouGo>): PayAsYouGo => ({ enabled: true, unlimited: false, balance: 150, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null, ...patch });
const render = (usage: ProviderUsage, error?: string) => renderToStaticMarkup(createElement(ServiceUsageDetails, { service: usage, error }));

test("Codex の詳細には全使用枠・アカウント・補足・取得時刻を表示する", () => {
  const html = render(service());
  for (const text of ["5時間", "週", "9%", "1%", "test@example.com", "クレジット残り 150", "時点", "1 分ごとに自動更新"]) {
    assert.ok(html.includes(text), text);
  }
  assert.equal((html.match(/role="meter"/g) ?? []).length, 2);
  assert.ok(!html.includes("meter-inline"));
});

test("更新の通信に失敗しても取得済みの枠を残し、失敗の理由を添える", () => {
  const html = render(service(), "通信に失敗しました");
  assert.ok(html.includes("9%"));
  assert.ok(html.includes("通信に失敗しました"));
  assert.ok(html.includes('class="error small"'));
});

test("取得できないときはエラーやログインが必要な理由を表示する", () => {
  const failed = render(service({ status: "error", windows: [], message: "取得に失敗しました" }));
  assert.ok(failed.includes("取得に失敗しました"));
  assert.ok(failed.includes('class="error small"'));
  const unavailable = render(service({ status: "unavailable", windows: [], message: "Codex にログインしていません" }));
  assert.ok(unavailable.includes("Codex にログインしていません"));
  assert.ok(!unavailable.includes('role="meter"'));
});

test("枠・アカウント・補足がなくても空白だけにせず理由を表示する", () => {
  const html = render(service({ windows: [], account: null, notes: [] }));
  assert.ok(html.includes("使用枠の情報はありません"));
  assert.ok(!html.includes("test@example.com"));
  assert.ok(!html.includes("クレジット"));
});

test("Codex のクレジット: 残りが減っていれば「クレジット使用中」と減った分、あれば「あり」、なければ出さない", () => {
  const spending = render(service({ pay_as_you_go: credits({ balance: 142, spending: { since: "2026-11-18T10:00:00Z", from: 150, to: 142 } }) }));
  for (const text of ["クレジット使用中", "クレジットから引かれて動いています", "クレジットの残り 150 → 142（8 減りました）", "から"]) assert.ok(spending.includes(text), text);
  const available = render(service({ pay_as_you_go: credits({}) }));
  assert.ok(available.includes("クレジット: あり"));
  assert.ok(!render(service()).includes("usage-overage"));
});

const panel = (usage: ProviderUsage) => renderToStaticMarkup(createElement(ServiceUsageDetails, { service: usage, variant: "panel" }));

test("設定の Claude: 下の帯と同じ枠を出し、アカウント・補足は出さない。取れなければ理由、最新の取得の失敗は添える", () => {
  const claude = service({ provider: "claude", plan: "max", windows: [{ key: "five_hour", label: "5時間", utilization: null, resets_at: null }] });
  const ok = panel(claude);
  for (const text of ["Claude Code", "Max", "時点", "5 時間枠の情報が返っていません"]) assert.ok(ok.includes(text), text);
  assert.ok(!ok.includes("test@example.com") && !ok.includes("クレジット残り 150"));
  assert.ok(panel({ ...claude, error: "timeout" }).includes("最新の取得に失敗: timeout"));
  const unavailable = panel({ ...claude, status: "unavailable" });
  assert.ok(unavailable.includes("API キーで使っている場合は枠がありません") && !unavailable.includes("Max"));
  const failed = panel({ ...claude, status: "unavailable", error: "timeout" });
  assert.ok(failed.includes('class="error small"') && failed.includes("Max"));
  assert.ok(panel(service({ provider: "gemini", status: "unavailable", message: "ログインしていません" })).includes("<h3>Gemini</h3>"));
});
