import assert from "node:assert/strict";
import { test } from "node:test";
import { collectSubagents } from "@shared/chat/subagents";
import { makeEvent } from "@shared/testing/factories";
import { undeliveredReports, withUndeliveredReports } from "./reportHandover.js";


// 裏で動かしたサブエージェントが報告を送ったが、親が動かないまま作業が終わった
const lost = [
  makeEvent(1, "tool_use", { id: "bg", name: "Agent", input: { description: "調査" } }),
  makeEvent(2, "tool_result", { tool_use_id: "bg", is_error: false, content: "Async agent launched successfully.\nagentId: a1" }),
  makeEvent(3, "subagent", { task_id: "a1", tool_use_id: "bg", description: "調査", status: "running" }),
  makeEvent(4, "subagent", { task_id: "a1", tool_use_id: "bg", description: "", status: "completed", summary: "見つけたのは 3 件" }),
  makeEvent(5, "result", { status: "cancelled" }),
];

test("届かなかった報告: 次の指示の後ろに本文を添え、添えたら受け取ったとみなす", () => {
  const entries = undeliveredReports(lost);
  assert.deepEqual(
    entries.map((s) => s.key),
    ["bg"],
  );
  const prompt = withUndeliveredReports("次はテストを書いて", entries);
  assert.ok(prompt.startsWith("次はテストを書いて\n"));
  assert.match(prompt, /【届いていなかったサブエージェントの報告 1 件】/);
  assert.match(prompt, /サブエージェント「調査」（ID: a1）の報告 ---\n見つけたのは 3 件$/);
  // 添えるものがなければそのまま
  assert.equal(withUndeliveredReports("そのまま", []), "そのまま");

  // 自分の発言の handover に残したら、受け取ったことになり、次からは添えない
  const handed = [...lost, makeEvent(6, "user", { text: "次はテストを書いて", handover: ["bg"] })];
  assert.equal(collectSubagents(handed, {}, false)[0].delivery, "received");
  assert.equal(undeliveredReports(handed).length, 0);
});

test("届かなかった報告: 長い報告は頭だけを添え、続きはサブエージェントに聞くよう頼む", () => {
  const long = lost.map((e) => (e.id === 4 ? makeEvent(4, "subagent", { task_id: "a1", tool_use_id: "bg", description: "", status: "completed", summary: "あ".repeat(7000) }) : e));
  const prompt = withUndeliveredReports("続けて", undeliveredReports(long));
  assert.ok(prompt.length < 6500);
  assert.match(prompt, /続きはサブエージェントに SendMessage で聞いてください/);
});
