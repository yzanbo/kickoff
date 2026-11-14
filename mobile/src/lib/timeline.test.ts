import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent } from "@shared/types";
import { applyEventToLog, lastEventId, mergeEvents, timelineOf, toolSummary } from "./timeline";

const ev = (id: number, type: ChatEvent["type"], data: unknown): ChatEvent => ({ id, chat_id: 1, type, data, created_at: "2026-11-14T00:00:00Z" }) as ChatEvent;

test("timelineOf: 自分の発言・メインの返答・ツールの 1 行（結果で ✓ / ✕）・終わりを並べ、サブエージェントの中身と思考は出さない", () => {
  const events = [
    ev(1, "user", { type: "user", text: "直して", message_uuid: "m" }),
    ev(2, "thinking", { type: "thinking", text: "" }),
    ev(3, "tool_use", { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm   test" } }),
    ev(4, "tool_use", { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/a.ts" }, parent: "task" }),
    ev(5, "tool_result", { type: "tool_result", tool_use_id: "t1", content: "", is_error: true }),
    ev(6, "text", { type: "text", text: "直しました" }),
    ev(7, "text", { type: "text", text: "サブの中", parent: "task" }),
    ev(8, "result", { type: "result", status: "completed" }),
  ];
  assert.deepEqual(timelineOf(events), [
    { kind: "user", id: 1, text: "直して", note: null },
    { kind: "tool", id: 3, name: "Bash", summary: "npm test", state: "error" },
    { kind: "assistant", id: 6, text: "直しました", math: false },
    { kind: "end", id: 8, status: "終わりました", text: null },
  ]);
});

test("timelineOf: AI が描いた図は描いた位置にいちばん新しい中身で、描き直しの位置は 1 行。数式を含む返答には印", () => {
  const items = timelineOf([
    ev(1, "tool_use", { type: "tool_use", id: "v1", name: "mcp__kickoff_chat__show_visual", input: { kind: "svg", code: "<svg>1</svg>", title: "構成" } }),
    ev(2, "tool_result", { type: "tool_result", tool_use_id: "v1", content: "visual_id: v-abcdefgh", is_error: false }),
    ev(3, "tool_use", { type: "tool_use", id: "v2", name: "mcp__kickoff_chat__update_visual", input: { visual_id: "v-abcdefgh", code: "<svg>2</svg>" } }),
    ev(4, "tool_result", { type: "tool_result", tool_use_id: "v2", content: "visual_id: v-abcdefgh", is_error: false }),
    ev(5, "tool_use", { type: "tool_use", id: "v3", name: "mcp__kickoff_chat__show_visual", input: { kind: "html", code: "<p/>" } }),
    ev(6, "text", { type: "text", text: "面積は $\\pi r^2$ です" }),
  ]);
  assert.deepEqual(items, [
    { kind: "visual", id: 1, visual: { id: "v-abcdefgh", kind: "svg", code: "<svg>2</svg>", title: "構成", shownBy: "v1", updatedBy: ["v2"] }, text: "図を描いています…" },
    { kind: "notice", id: 3, text: "「構成」を描き直しました" },
    { kind: "visual", id: 5, visual: null, text: "図を描いています…" },
    { kind: "assistant", id: 6, text: "面積は $\\pi r^2$ です", math: true },
  ]);
});

test("timelineOf: 質問への回答・圧縮・失敗の理由", () => {
  const items = timelineOf([
    ev(1, "approval_resolved", { type: "approval_resolved", approval_id: "a", kind: "question", action: "answer", answers: { 色は: ["赤", "青"], 形は: "丸" } }),
    ev(2, "compact", { type: "compact", trigger: "auto", pre_tokens: 1 }),
    ev(3, "result", { type: "result", status: "failed", text: "通信が切れました" }),
  ]);
  assert.deepEqual(items, [
    { kind: "answer", id: 1, text: "色は: 赤、青\n形は: 丸" },
    { kind: "notice", id: 2, text: "会話を自動で圧縮しました" },
    { kind: "end", id: 3, status: "失敗しました", text: "通信が切れました" },
  ]);
});

test("mergeEvents・applyEventToLog: 同じ ID は置き換えて順に並べ、巻き戻しで消えた分を落とす。ほかのチャットの知らせでは変えない", () => {
  const log = mergeEvents([ev(1, "notice", { type: "notice", message: "a" })], [ev(3, "notice", { type: "notice", message: "c" }), ev(2, "notice", { type: "notice", message: "b" })]);
  assert.deepEqual(log.map((e) => e.id), [1, 2, 3]);
  assert.equal(lastEventId(log), 3);
  const other = applyEventToLog(log, 1, { type: "chat_event", project_id: 1, event: { ...ev(4, "notice", { type: "notice", message: "x" }), chat_id: 2 } });
  assert.equal(other, log);
  const added = applyEventToLog(log, 1, { type: "chat_event", project_id: 1, event: ev(4, "notice", { type: "notice", message: "d" }) });
  assert.deepEqual(added.map((e) => e.id), [1, 2, 3, 4]);
  const rewound = applyEventToLog(added, 1, { type: "chat_events_deleted", project_id: 1, chat_id: 1, from_event_id: 3 });
  assert.deepEqual(rewound.map((e) => e.id), [1, 2]);
});

test("toolSummary: 分かりやすい入力を 1 行に（長ければ切る）。なければツールの名前", () => {
  assert.equal(toolSummary("Edit", { file_path: "/x.ts", old_string: "a" }), "/x.ts");
  assert.equal(toolSummary("Task", {}), "Task");
  assert.equal(toolSummary("Bash", { command: "x".repeat(200) }).length, 120);
});
