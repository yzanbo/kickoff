import assert from "node:assert/strict";
import { test } from "vitest";
import { makeEvent } from "@shared/foundation/testing/factories";
import { applyEventToLog, lastEventId, mergeEvents, timelineOf, toolText } from "./timeline";

test("AI 切り替えの前後の返答は、それぞれの AI を表示する", () => {
  const items = timelineOf([
    makeEvent(1, "text", { text: "前" }),
    makeEvent(2, "provider_switched", { from: "claude", to: "codex" }),
    makeEvent(3, "text", { text: "後" }),
  ], "codex");
  assert.deepEqual(items, [
    { kind: "assistant", id: 1, text: "前", math: false, provider: "claude" },
    { kind: "notice", id: 2, text: "Claude Code → Codex に切り替えました" },
    { kind: "assistant", id: 3, text: "後", math: false, provider: "codex" },
  ]);
});

test("timelineOf: 自分の発言・メインの返答・ツールの 1 行（結果で ✓ / ✕）・終わりを並べ、サブエージェントの中身と思考は出さない", () => {
  const events = [
    makeEvent(1, "user", { text: "直して", message_uuid: "m" }),
    makeEvent(2, "thinking", { text: "" }),
    makeEvent(3, "tool_use", { id: "t1", name: "Bash", input: { command: "npm   test" } }),
    makeEvent(4, "tool_use", { id: "t2", name: "Read", input: { file_path: "/a.ts" }, parent: "task" }),
    makeEvent(5, "tool_result", { tool_use_id: "t1", content: "", is_error: true }),
    makeEvent(6, "text", { text: "直しました" }),
    makeEvent(7, "text", { text: "サブの中", parent: "task" }),
    makeEvent(8, "result", { status: "completed" }),
  ];
  assert.deepEqual(timelineOf(events), [
    { kind: "user", id: 1, text: "直して", note: null },
    { kind: "tool", id: 3, name: "コマンド", summary: "npm test", state: "error" },
    { kind: "assistant", id: 6, text: "直しました", math: false },
    { kind: "end", id: 8, status: "終わりました", text: null },
  ]);
});

test("timelineOf: AI が描いた図は描いた位置にいちばん新しい中身で、描き直しの位置は 1 行。数式を含む返答には印", () => {
  const items = timelineOf([
    makeEvent(1, "tool_use", { id: "v1", name: "mcp__kickoff_chat__show_visual", input: { kind: "svg", code: "<svg>1</svg>", title: "構成" } }),
    makeEvent(2, "tool_result", { tool_use_id: "v1", content: "visual_id: v-abcdefgh", is_error: false }),
    makeEvent(3, "tool_use", { id: "v2", name: "mcp__kickoff_chat__update_visual", input: { visual_id: "v-abcdefgh", code: "<svg>2</svg>" } }),
    makeEvent(4, "tool_result", { tool_use_id: "v2", content: "visual_id: v-abcdefgh", is_error: false }),
    makeEvent(5, "tool_use", { id: "v3", name: "mcp__kickoff_chat__show_visual", input: { kind: "html", code: "<p/>" } }),
    makeEvent(6, "text", { text: "面積は $\\pi r^2$ です" }),
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
    makeEvent(1, "approval_resolved", { approval_id: "a", kind: "question", action: "answer", answers: { 色は: ["赤", "青"], 形は: "丸" } }),
    makeEvent(2, "compact", { trigger: "auto", pre_tokens: 1 }),
    makeEvent(3, "result", { status: "failed", text: "通信が切れました" }),
  ]);
  assert.deepEqual(items, [
    { kind: "answer", id: 1, text: "色は: 赤、青\n形は: 丸" },
    { kind: "notice", id: 2, text: "会話を自動で圧縮しました" },
    { kind: "end", id: 3, status: "失敗しました", text: "通信が切れました" },
  ]);
});

test("mergeEvents・applyEventToLog: 同じ ID は置き換えて順に並べ、巻き戻しで消えた分を落とす。ほかのチャットの知らせでは変えない", () => {
  const log = mergeEvents([makeEvent(1, "notice", { message: "a" })], [makeEvent(3, "notice", { message: "c" }), makeEvent(2, "notice", { message: "b" })]);
  assert.deepEqual(log.map((e) => e.id), [1, 2, 3]);
  assert.equal(lastEventId(log), 3);
  const other = applyEventToLog(log, 1, { type: "chat_event", project_id: 1, event: makeEvent(4, "notice", { message: "x" }, { chat_id: 2 }) });
  assert.equal(other, log);
  const added = applyEventToLog(log, 1, { type: "chat_event", project_id: 1, event: makeEvent(4, "notice", { message: "d" }) });
  assert.deepEqual(added.map((e) => e.id), [1, 2, 3, 4]);
  const rewound = applyEventToLog(added, 1, { type: "chat_events_deleted", project_id: 1, chat_id: 1, from_event_id: 3 });
  assert.deepEqual(rewound.map((e) => e.id), [1, 2]);
});

test("toolText: スマホのツールの行もデスクトップと同じ表（名前の札と入力の 1 行）", () => {
  assert.equal(toolText.describeToolInput("Edit", { file_path: "/x.ts", old_string: "a" }), "/x.ts");
  assert.equal(toolText.toolLabel("mcp__kickoff_chat__get_user_view"), "画面を見る");
});
