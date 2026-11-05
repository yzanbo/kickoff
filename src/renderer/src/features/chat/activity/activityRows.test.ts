import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubagentEntry } from "@shared/chat/subagents";
import { relayMessage } from "@shared/chat/prompts";
import { eventSequence } from "@shared/testing/factories";
import { subagentTree } from "@/features/chat/subagents/subagentTree";
import { activityRows, filterActivity } from "./activityRows";

/** 2026-11-01 00:00:00 から sec 秒後の時刻 */
const at = (sec: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, sec)).toISOString();
const agent = (key: string, extra: Partial<SubagentEntry> = {}): SubagentEntry => ({ key, description: key, status: "running", ...extra });
const summary = (rows: ReturnType<typeof activityRows>) => rows.map((r) => [r.agent ?? "main", r.kind, r.text]);

test("activityRows: メインの指示・ツール・返答・作業の終わりを時刻の順に、1 行目だけ・続けてのツールは 1 行で", () => {
  const ev = eventSequence();
  const events = [
    ev("user", { text: "型エラーを直して\n詳しくは…" }, { created_at: at(0) }),
    ev("tool_use", { id: "b1", name: "Bash", input: { command: "npm run typecheck" } }, { created_at: at(1) }),
    ev("tool_result", { tool_use_id: "b1", content: "ok", is_error: false }, { created_at: at(5) }),
    ev("text", { text: "読みます" }, { created_at: at(5) }),
    ev("tool_use", { id: "r1", name: "Read", input: { file_path: "/r/a.ts" } }, { created_at: at(6) }),
    ev("tool_use", { id: "r2", name: "Read", input: { file_path: "/r/b.ts" } }, { created_at: at(6) }),
    ev("tool_result", { tool_use_id: "r1", content: "", is_error: false }, { created_at: at(7) }),
    ev("tool_result", { tool_use_id: "r2", content: "", is_error: false }, { created_at: at(8) }),
    ev("text", { text: "原因は exec の型です。\n…" }, { created_at: at(9) }),
    ev("result", { status: "completed", text: "原因は…" }, { created_at: at(10) }),
  ];
  const rows = activityRows(events, subagentTree([]), false);
  assert.deepEqual(summary(rows), [
    ["main", "prompt", "指示「型エラーを直して」"],
    ["main", "tools", "コマンド: npm run typecheck"],
    ["main", "reply", "返答「読みます」"],
    ["main", "tools", "2個のファイルを読み取り"],
    ["main", "reply", "返答「原因は exec の型です。」"],
    ["main", "turn", "作業の終わり"],
  ]);
  assert.equal(rows[1].durationMs, 4000);
  assert.equal(rows[3].durationMs, 2000);
  assert.equal(rows[5].durationMs, 10_000);
});

test("activityRows: サブエージェントの動きは起動の行のあとに時刻の順で混ざり、終わりの行で報告先とかかった時間", () => {
  const ev = eventSequence();
  const events = [
    ev("user", { text: "調べて" }, { created_at: at(0) }),
    ev("tool_use", { id: "a1", name: "Agent", input: { description: "調査", prompt: "…" } }, { created_at: at(1) }),
    ev("tool_use", { id: "ag", name: "Grep", input: { pattern: "x" }, parent: "a1" }, { created_at: at(3) }),
    ev("tool_result", { tool_use_id: "ag", content: "1", is_error: false, parent: "a1" }, { created_at: at(4) }),
    ev("tool_use", { id: "b1", name: "Agent", input: { description: "洗い出し", prompt: "…" }, parent: "a1" }, { created_at: at(5) }),
    ev("tool_use", { id: "m1", name: "Glob", input: { pattern: "*.ts" } }, { created_at: at(6) }),
    ev("tool_result", { tool_use_id: "m1", content: "", is_error: false }, { created_at: at(6) }),
  ];
  const tree = subagentTree([
    agent("a1", { description: "調査", status: "completed", startedAt: at(1), endedAt: at(20) }),
    agent("b1", { description: "洗い出し", parentKey: "a1", status: "completed", startedAt: at(5), endedAt: at(15) }),
  ]);
  const rows = activityRows(events, tree, false);
  assert.deepEqual(summary(rows), [
    ["main", "prompt", "指示「調べて」"],
    ["main", "launch", "サブエージェント「調査」を起動"],
    ["a1", "tools", "検索: x"],
    ["a1", "launch", "サブエージェント「洗い出し」を起動"],
    ["main", "tools", "ファイル検索: *.ts"],
    ["b1", "end", "報告 → 調査"],
    ["a1", "end", "報告 → メイン"],
  ]);
  assert.equal(rows.find((r) => r.kind === "launch")?.child, "a1");
  assert.equal(rows.find((r) => r.key === "end-a1")?.durationMs, 19_000);
});

test("activityRows: 結果の届いていないツールは、持ち主が動いているときだけ実行中（前の作業で止まったものは実行中にしない）", () => {
  const ev = eventSequence();
  const events = [
    ev("tool_use", { id: "old", name: "Bash", input: { command: "sleep 9" } }, { created_at: at(0) }),
    ev("result", { status: "cancelled" }, { created_at: at(1) }),
    ev("user", { text: "続けて" }, { created_at: at(2) }),
    ev("tool_use", { id: "now", name: "Bash", input: { command: "npm test" } }, { created_at: at(3) }),
  ];
  const rows = activityRows(events, subagentTree([]), true);
  const tools = rows.filter((r) => r.kind === "tools");
  assert.deepEqual(tools.map((r) => [r.text, Boolean(r.running)]), [
    ["コマンド: sleep 9", false],
    ["コマンド: npm test", true],
  ]);
  assert.equal(activityRows(events, subagentTree([]), false).some((r) => r.running), false);
});

test("activityRows: チャット欄から伝えた指示は宛先付き、中の手順が届かない実行中のものは途中経過の最後のツールを 1 行", () => {
  const ev = eventSequence();
  const events = [
    ev("tool_use", { id: "a1", name: "Agent", input: { description: "調査" } }, { created_at: at(0) }),
    ev("tool_use", { id: "c1", name: "Agent", input: { description: "内側" }, parent: "a1" }, { created_at: at(1) }),
    ev("user", { text: relayMessage("ag-1", "調査", "テストも見て") }, { created_at: at(2) }),
  ];
  const tree = subagentTree([
    agent("a1", { description: "調査", agentId: "ag-1", startedAt: at(0) }),
    agent("c1", { description: "内側", parentKey: "a1", startedAt: at(1), lastTool: "Glob", lastActivityAt: at(3) }),
  ]);
  const rows = activityRows(events, tree, true);
  assert.deepEqual(summary(rows), [
    ["main", "launch", "サブエージェント「調査」を起動"],
    ["a1", "launch", "サブエージェント「内側」を起動"],
    ["main", "prompt", "伝える → 調査「テストも見て」"],
    ["c1", "now", "いま: Glob"],
  ]);
});

test("filterActivity: メインだけ・そのサブエージェントと配下だけ（その起動の行は外す）", () => {
  const ev = eventSequence();
  const events = [
    ev("tool_use", { id: "a1", name: "Agent", input: { description: "調査" } }, { created_at: at(0) }),
    ev("text", { text: "読みます", parent: "a1" }, { created_at: at(1) }),
    ev("tool_use", { id: "b1", name: "Agent", input: { description: "内側" }, parent: "a1" }, { created_at: at(2) }),
    ev("text", { text: "探します", parent: "b1" }, { created_at: at(3) }),
    ev("text", { text: "待っています" }, { created_at: at(4) }),
  ];
  const tree = subagentTree([agent("a1"), agent("b1", { parentKey: "a1" })]);
  const rows = activityRows(events, tree, true);
  assert.deepEqual(filterActivity(rows, tree, { kind: "main" }).map((r) => r.text), ["サブエージェント「a1」を起動", "返答「待っています」"]);
  assert.deepEqual(filterActivity(rows, tree, { kind: "agent", key: "a1" }).map((r) => r.text), [
    "発言「読みます」",
    "サブエージェント「b1」を起動",
    "発言「探します」",
  ]);
  assert.equal(filterActivity(rows, tree, { kind: "all" }), rows);
});
