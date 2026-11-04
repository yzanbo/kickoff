import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { callDuration, toolSpan } from "./toolTimes";

const at = (sec: number) => new Date(Date.UTC(2026, 10, 5, 0, 0, sec)).toISOString();
const ev = eventSequence();
const call = (id: string, start: number, end?: number): ToolCall => ({
  use: ev("tool_use", { id, name: "Bash", input: {} }, { created_at: at(start) }),
  ...(end === undefined ? {} : { result: ev("tool_result", { tool_use_id: id, content: "", is_error: false }, { created_at: at(end) }) }),
});

test("toolSpan: 最初に始めた時刻・最後に始めた時刻・最後に終わった時刻（並べた順によらない）", () => {
  assert.deepEqual(toolSpan([call("a", 10, 40), call("b", 5, 12), call("c", 20, 25)]), { start: at(5), latestStart: at(20), end: at(40) });
});

test("toolSpan: 結果のない呼び出し（実行中・中断）は始めた時刻で数える", () => {
  assert.deepEqual(toolSpan([call("a", 10, 15), call("b", 30)]), { start: at(10), latestStart: at(30), end: at(30) });
});

test("callDuration: 結果が届いていればかかった時間、なければ undefined", () => {
  assert.equal(callDuration(call("a", 10, 13)), 3000);
  assert.equal(callDuration(call("b", 10)), undefined);
});
