import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ServiceUsage } from "@shared/types";
import { ServiceUsageDetails } from "./ServiceUsagePopover";

const service = (patch: Partial<ServiceUsage> = {}): ServiceUsage => ({
  id: "codex",
  label: "Codex",
  status: "ok",
  plan: "plus",
  account: "test@example.com",
  windows: [
    { key: "primary", label: "5時間", utilization: 9, resets_at: "2030-01-01T12:00:00Z" },
    { key: "secondary", label: "週", utilization: 1, resets_at: "2030-01-05T12:00:00Z" },
  ],
  notes: ["クレジット残り 150"],
  fetched_at: "2026-11-17T00:00:00Z",
  ...patch,
});

const render = (usage: ServiceUsage, error?: string) => renderToStaticMarkup(createElement(ServiceUsageDetails, { service: usage, error }));

test("Codex の詳細には全使用枠・アカウント・補足・取得時刻を表示する", () => {
  const html = render(service());
  for (const text of ["5時間", "週", "9%", "1%", "test@example.com", "クレジット残り 150", "時点", "5 分ごとに自動更新"]) {
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
