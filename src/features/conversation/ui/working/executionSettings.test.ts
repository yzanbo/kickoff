import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import { makeChat, makeEvent } from "@shared/foundation/testing/factories";
import { modelDefaultEffortOf, WorkingExecutionBadges } from "./WorkingExecution";
import { workingExecutionOf } from "./executionSettings";

const start = "2026-11-17T00:00:10.000Z";
const before = "2026-11-17T00:00:09.000Z";
const after = "2026-11-17T00:00:11.000Z";

test("実行開始の通知があれば実際のモデル・深さ・権限を優先する（Codex の深さの変換も反映）", () => {
  const chat = makeChat(1, { provider: "codex", model: "gpt-6.1-sol", effort: "max", permission_mode: "default", fast_mode: false, turn_started_at: start });
  const init = makeEvent(1, "init", { session_id: "s", model: "gpt-6.1-terra", effort: "xhigh", permission_mode: "auto" }, { created_at: after });
  assert.deepEqual(workingExecutionOf(chat, [init]), {
    provider: "codex", model: "gpt-6.1-terra", effort: "xhigh", permission: "auto", fastRequested: false,
  });
});

test("今回の開始通知がまだなければ前回の通知を使わず、チャットで送った選択を表示する", () => {
  const chat = makeChat(1, { provider: "claude", model: "opus", effort: "high", permission_mode: "plan", fast_mode: true, turn_started_at: start });
  const old = makeEvent(1, "init", { session_id: "old", model: "old-model", effort: "low" }, { created_at: before });
  const done = makeEvent(2, "result", { status: "completed" }, { created_at: before });
  const expected = { provider: "claude", model: "opus", effort: "high", permission: "plan", fastRequested: true };
  assert.deepEqual(workingExecutionOf(chat, [old]), expected);
  assert.deepEqual(workingExecutionOf(chat, [old, done]), expected);
  const failed = makeEvent(3, "error", { message: "失敗" }, { created_at: after });
  const staleInit = makeEvent(4, "init", { session_id: "old", model: "old-model" }, { created_at: after });
  assert.deepEqual(workingExecutionOf(chat, [staleInit, failed]), expected);
  assert.deepEqual(workingExecutionOf({ ...chat, turn_started_at: null }, [old]), expected);
});

test("通知の明示的な null は深さを指定しないことを表し、途中の追加指示では実行を取り違えない", () => {
  const chat = makeChat(1, { effort: "high", turn_started_at: start });
  const init = makeEvent(1, "init", { session_id: "s", effort: null }, { created_at: after });
  const followup = makeEvent(2, "user", { text: "追加" }, { created_at: after });
  assert.equal(workingExecutionOf(chat, [init, followup]).effort, null);
});

test("Codex の既定はモデル一覧の値と明示し、指定や実行値・未知の場合と混同しない", () => {
  const chat = makeChat(1, { provider: "codex", model: "model-a", effort: null });
  const execution = workingExecutionOf(chat, []);
  const models = [{ value: "model-a", label: "A", description: "", efforts: [], default_effort: "high", supports_auto_mode: true, supports_fast_mode: false }];
  assert.equal(modelDefaultEffortOf(execution, models), "high");
  assert.equal(modelDefaultEffortOf({ ...execution, model: "other" }, models), undefined);
  assert.equal(modelDefaultEffortOf({ ...execution, model: null }, models), undefined);
  assert.equal(modelDefaultEffortOf({ ...execution, provider: "claude" }, models), undefined);
  const render = (overrides: Partial<typeof execution>, modelDefaultEffort?: string) => renderToStaticMarkup(createElement(WorkingExecutionBadges, {
    execution: { ...execution, ...overrides }, model: "Model A", modelDefaultEffort,
  }));
  assert.ok(render({}, "high").includes("推論: 既定（モデルの既定は High）"));
  assert.ok(render({}, "future").includes("推論: 既定（モデルの既定は future）"));
  assert.ok(render({}, undefined).includes("推論: 既定"));
  assert.ok(!render({}, undefined).includes("モデルの既定は"));
  assert.ok(render({ effort: "low" }, "high").includes("推論: Low"));
  assert.ok(!render({ effort: "low" }, "high").includes("モデルの既定は"));
  assert.ok(!render({ provider: "claude" }, "high").includes("モデルの既定は"));
});

test("作業中の札に AI・モデル・推論・権限・Fast の指定を出し、未知の値も隠さない", () => {
  const chat = makeChat(1, { provider: "codex", model: "gpt-6.1-terra", effort: "high", permission_mode: "auto", fast_mode: true });
  const execution = workingExecutionOf(chat, []);
  const html = renderToStaticMarkup(createElement(WorkingExecutionBadges, { execution, model: "Terra 6.1" }));
  for (const text of ["今回の実行設定", "Codex", "モデル: Terra 6.1", "推論: High", "権限: Auto mode", "Fast 指定"]) {
    assert.ok(html.includes(text), text);
  }
  const fallback = renderToStaticMarkup(createElement(WorkingExecutionBadges, {
    execution: { ...execution, provider: "claude", model: null, effort: null, permission: "other", fastRequested: false }, model: "既定",
  }));
  for (const text of ["Claude Code", "モデル: 既定", "推論: 既定", "権限: other", "Fast 指定なし"]) {
    assert.ok(fallback.includes(text), text);
  }
});
