import assert from "node:assert/strict";
import { test } from "node:test";
import { makeEvent } from "@shared/testing/factories";
import { cleanSubagentReport, collectSubagents, isOutputLimitError, networkStoppedSubagents, subagentReport, unfinishedSubagents } from "./subagents";


test("サブエージェント: 呼び出し・通知・途中経過をまとめ、止まったものは中断にする", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "レビュー A", subagent_type: "general-purpose", model: "sonnet" } }),
    makeEvent(2, "tool_use", { id: "tu2", name: "Task", input: { description: "調査 B" } }),
    makeEvent(3, "subagent", { task_id: "t1", tool_use_id: "tu1", description: "", status: "completed", tokens: 78800 }),
    makeEvent(4, "tool_result", { tool_use_id: "tu1", content: "ok", is_error: false }),
    makeEvent(5, "tool_use", { id: "tu3", name: "Read", input: {} }),
  ];
  const running = collectSubagents(events, { tu2: { task_id: "t2", tool_use_id: "tu2", description: "調査 B", status: "running", tokens: 1200, last_tool: "Grep" } }, true);
  assert.equal(running.length, 2);
  assert.deepEqual(
    running.map((s) => [s.description, s.status, s.tokens, s.model ?? null, s.lastTool ?? null]),
    [
      ["レビュー A", "completed", 78800, "sonnet", null],
      ["調査 B", "running", 1200, null, "Grep"],
    ],
  );
  assert.equal(running[0].toolUseEventId, 1);

  const stopped = collectSubagents(events, {}, false);
  assert.equal(stopped[1].status, "stopped");
});

test("サブエージェント: 以前の記録に残った、裏で動かしたコマンド（Bash）のタスクは出さない", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "bash1", name: "Bash", input: { command: "npm run dev", run_in_background: true } }),
    makeEvent(2, "subagent", { task_id: "b1", tool_use_id: "bash1", description: "開発版を起動する", status: "running" }),
    makeEvent(3, "subagent", { task_id: "b1", tool_use_id: "bash1", description: "", status: "failed" }),
    makeEvent(4, "tool_use", { id: "tu1", name: "Agent", input: { description: "調査" } }),
    makeEvent(5, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "", status: "completed" }),
  ];
  assert.deepEqual(
    collectSubagents(events, {}, false).map((s) => [s.key, s.status]),
    [["tu1", "completed"]],
  );
});

test("サブエージェントの報告: 前置きと字下げを外す", () => {
  const raw =
    "  <tools-used-before-summary>Glob</tools-used-before-summary>\n  \n[Subagent hand-back] The text below is ... The report follows:\n  ありませんでした。\n  \n  ファイルは変更していません。";
  assert.equal(cleanSubagentReport(raw), "ありませんでした。\n\nファイルは変更していません。");
  assert.equal(cleanSubagentReport("そのままの報告"), "そのままの報告");
});

test("裏で動かしたサブエージェントは、起動の知らせでは完了にせず、作業が止まっていれば中断にする", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "a", name: "Agent", input: { description: "裏の作業" } }),
    makeEvent(2, "tool_result", { tool_use_id: "a", is_error: false, content: "Async agent launched successfully." }),
  ];
  assert.equal(collectSubagents(events, {}, true)[0].status, "running");
  assert.equal(collectSubagents(events, {}, false)[0].status, "stopped");
});

test("サブエージェント: SendMessage で再開した回は、作業 ID で元の行にまとめ、作業中に戻して最新の報告に置き換える", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "調べもの" } }),
    makeEvent(2, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "調べもの", status: "running" }),
    makeEvent(3, "tool_result", { tool_use_id: "tu1", is_error: false, content: "Async agent launched successfully.\nagentId: a1 (internal ID)" }),
    makeEvent(4, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "1 回目の報告" }),
    makeEvent(5, "tool_use", { id: "sm1", name: "SendMessage", input: { to: "a1" } }),
    makeEvent(6, "subagent", { task_id: "a1", tool_use_id: "sm1", description: "調べもの", status: "running" }),
  ];
  const resumed = collectSubagents(events, {}, true);
  assert.deepEqual(resumed.map((s) => [s.key, s.description, s.status, s.agentId, s.summary]), [["tu1", "調べもの", "running", "a1", "1 回目の報告"]]);
  // 途中経過は作業 ID で届く（呼び出し ID は SendMessage のもの）
  const withProgress = collectSubagents(events, { a1: { task_id: "a1", tool_use_id: "sm1", description: "", status: "running", tokens: 500, last_tool: "Bash" } }, true);
  assert.deepEqual([withProgress[0].tokens, withProgress[0].lastTool], [500, "Bash"]);
  const done = collectSubagents([...events, makeEvent(7, "subagent", { task_id: "a1", tool_use_id: "sm1", description: "", status: "completed", summary: "2 回目の報告" })], {}, false);
  assert.deepEqual(done.map((s) => [s.status, s.summary]), [["completed", "2 回目の報告"]]);
});

test("サブエージェントの報告: SubagentHandback の本文 → 終わりの知らせの要約 → ツールの結果の順に探す", () => {
  const base = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "調べもの" } }),
    makeEvent(2, "tool_result", { tool_use_id: "tu1", is_error: false, content: "ツールの結果の報告" }),
  ];
  const entry = (summary?: string) => ({ key: "tu1", description: "調べもの", status: "completed" as const, summary });
  assert.equal(subagentReport(entry(), base), "ツールの結果の報告");
  assert.equal(subagentReport(entry("要約の報告"), base), "要約の報告");
  // 要約が「別の知らせで届けた」という案内なら使わない
  const pointer = "This agent's report was delivered to you as a message from \"a1\" (its SubagentHandback call).";
  assert.equal(subagentReport(entry(pointer), [makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: {} })]), undefined);
  const handbacks = [
    ...base,
    makeEvent(3, "tool_use", { id: "h1", name: "SubagentHandback", parent: "tu1", input: { message: "1 回目" } }),
    makeEvent(4, "tool_use", { id: "h2", name: "SubagentHandback", parent: "tu1", input: { message: "2 回目" } }),
  ];
  assert.equal(subagentReport(entry(pointer), handbacks), "2 回目");
});

test("サブエージェント: 裏で動いているものの一覧から消えたら、報告を渡していれば完了・なければ中断にする（待つ形のものは一覧で判断しない）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "bg1", name: "Agent", input: { description: "裏 1" } }),
    makeEvent(2, "subagent", { task_id: "a1", tool_use_id: "bg1", description: "裏 1", status: "running" }),
    makeEvent(3, "tool_result", { tool_use_id: "bg1", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(4, "tool_use", { id: "h1", name: "SubagentHandback", parent: "bg1", input: { message: "報告" } }),
    makeEvent(5, "tool_use", { id: "bg2", name: "Agent", input: { description: "裏 2" } }),
    makeEvent(6, "subagent", { task_id: "a2", tool_use_id: "bg2", description: "裏 2", status: "running" }),
    makeEvent(7, "tool_result", { tool_use_id: "bg2", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(8, "tool_use", { id: "fg1", name: "Agent", input: { description: "待つ形" } }),
    makeEvent(9, "subagent", { task_id: "a3", tool_use_id: "fg1", description: "待つ形", status: "running" }),
  ];
  // 一覧の知らせがなければ、これまでどおり作業中のまま
  assert.deepEqual(collectSubagents(events, {}, true).map((s) => s.status), ["running", "running", "running"]);
  // 一覧が空（裏の 2 件は消えた）: 報告を渡した 1 件目は完了、2 件目は中断。待つ形のものは作業中のまま
  assert.deepEqual(collectSubagents(events, {}, true, new Set()).map((s) => s.status), ["completed", "stopped", "running"]);
  // 2 件目がまだ一覧にあれば作業中
  assert.deepEqual(collectSubagents(events, {}, true, new Set(["a2"])).map((s) => s.status), ["completed", "running", "running"]);
  // Claude Code が終わった: 報告を渡したものは完了
  assert.deepEqual(collectSubagents(events, {}, false).map((s) => s.status), ["completed", "stopped", "stopped"]);
});

test("サブエージェント: API のエラー（通信の切断）で終わったものは、通信の切断で止まったとする（ほかの失敗・自分で止めたものは違う）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "通信", prompt: "調べて" } }),
    makeEvent(2, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "通信", status: "running" }),
    makeEvent(3, "tool_use", { id: "tu2", name: "Agent", input: { description: "ほかの失敗" } }),
    makeEvent(4, "subagent", { task_id: "a2", tool_use_id: "tu2", description: "ほかの失敗", status: "running" }),
    makeEvent(5, "tool_use", { id: "tu3", name: "Agent", input: { description: "止めた" } }),
    makeEvent(6, "subagent", { task_id: "a3", tool_use_id: "tu3", description: "止めた", status: "running" }),
    makeEvent(7, "subagent", {
      task_id: "a1",
      tool_use_id: "tu1",
      description: "",
      status: "failed",
      summary: "Agent terminated early due to an API error: API Error: Connection dropped (ECONNRESET).",
    }),
    makeEvent(8, "subagent", { task_id: "a2", tool_use_id: "tu2", description: "", status: "failed", summary: "テストが通りませんでした" }),
    makeEvent(9, "subagent", { task_id: "a3", tool_use_id: "tu3", description: "", status: "stopped" }),
  ];
  const list = collectSubagents(events, {}, false);
  assert.deepEqual(list.map((s) => [s.description, s.status, s.network, s.endEventId]), [
    ["通信", "failed", true, 7],
    ["ほかの失敗", "failed", false, 8],
    ["止めた", "stopped", false, 9],
  ]);
  assert.equal(list[0].prompt, "調べて");
  assert.deepEqual(networkStoppedSubagents(events, 0).map((s) => s.agentId), ["a1"]);
  // 止まったのが sinceEventId 以前（前の実行）なら数えない
  assert.deepEqual(networkStoppedSubagents(events, 7), []);
});

test("サブエージェント: 通信の切断で親ごと終わったときに動いていたものは、通信の切断で中断。再開したら印を外す", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "裏" } }),
    makeEvent(2, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "裏", status: "running" }),
    makeEvent(3, "tool_result", { tool_use_id: "tu1", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(4, "result", { status: "failed", text: "API Error: Connection error.", network: true }),
  ];
  const [stopped] = collectSubagents(events, {}, false);
  assert.deepEqual([stopped.status, stopped.network, stopped.endEventId], ["stopped", true, 4]);
  assert.deepEqual(networkStoppedSubagents(events, 3).map((s) => s.agentId), ["a1"]);
  // 以前の記録（network の印がない）でも、失敗の文で見分ける
  const legacy = [...events.slice(0, 3), makeEvent(4, "result", { status: "failed", text: "Unable to connect to API (ENOTFOUND)" })];
  assert.equal(collectSubagents(legacy, {}, false)[0].network, true);
  // 自分で止めた（中断）・通信以外の失敗なら、通信の印は付けない
  assert.equal(collectSubagents([...events.slice(0, 3), makeEvent(4, "result", { status: "cancelled" })], {}, false)[0].network, false);
  // SendMessage で再開した: 作業中に戻り、通信の印も外れる。終わったら完了
  const resumed = [
    ...events,
    makeEvent(5, "user", { text: "続けて" }),
    makeEvent(6, "tool_use", { id: "sm1", name: "SendMessage", input: { to: "a1" } }),
    makeEvent(7, "subagent", { task_id: "a1", tool_use_id: "sm1", description: "裏", status: "running" }),
  ];
  const [again] = collectSubagents(resumed, {}, true);
  assert.deepEqual([again.status, again.network, again.startEventId], ["running", undefined, 7]);
  assert.deepEqual(networkStoppedSubagents(resumed, 0), []);
});

test("サブエージェント: 実行の終わりに終わっていないものは、その実行で始めた分だけ返す（報告を渡したもの・前の実行のものは除く）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "old", name: "Agent", input: { description: "前の実行" } }),
    makeEvent(2, "tool_result", { tool_use_id: "old", is_error: false, content: "Async agent launched" }),
    makeEvent(3, "user", { text: "いま" }),
    makeEvent(4, "tool_use", { id: "a", name: "Agent", input: { description: "タグ付け" } }),
    makeEvent(5, "tool_result", { tool_use_id: "a", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(6, "tool_use", { id: "b", name: "Agent", input: { description: "音声入力" } }),
    makeEvent(7, "tool_result", { tool_use_id: "b", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(8, "subagent", { task_id: "tb", tool_use_id: "b", description: "", status: "completed" }),
    makeEvent(9, "tool_use", { id: "c", name: "Agent", input: { description: "報告済み" } }),
    makeEvent(10, "tool_result", { tool_use_id: "c", is_error: false, content: "Async agent launched successfully." }),
    makeEvent(11, "tool_use", { id: "h", name: "SubagentHandback", parent: "c", input: { message: "報告" } }),
    // 「伝える」で足した発言のあとも、同じ実行の分として数える
    makeEvent(12, "user", { text: "伝えた" }),
    makeEvent(13, "tool_use", { id: "d", name: "Agent", input: { description: "待つ形" } }),
  ];
  assert.deepEqual(unfinishedSubagents(events, 3).map((s) => s.description), ["タグ付け", "待つ形"]);
  // 自分で止めた（終わりの知らせがある）ものは、作業の終わりで止まったものではない
  const stoppedByUser = [...events, makeEvent(14, "subagent", { task_id: "ta", tool_use_id: "a", description: "", status: "stopped" })];
  assert.deepEqual(unfinishedSubagents(stoppedByUser, 3).map((s) => s.description), ["待つ形"]);
});

test("サブエージェント: 最後に動いた時刻と、結果を待っているツール（中の発言・ツール・知らせで進める）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "調査" } }, { created_at: "2026-11-03T12:00:00Z" }),
    makeEvent(2, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" }, { created_at: "2026-11-03T12:00:01Z" }),
    makeEvent(3, "text", { text: "調べます", parent: "tu1" }, { created_at: "2026-11-03T12:01:00Z" }),
    makeEvent(4, "tool_use", { id: "b1", name: "Bash", input: { command: "npm test" }, parent: "tu1" }, { created_at: "2026-11-03T12:02:00Z" }),
  ];
  const [running] = collectSubagents(events, {}, true);
  assert.deepEqual([running.lastActivityAt, running.pendingTool], ["2026-11-03T12:02:00Z", "Bash"]);
  // 結果が届いたら、待っているツールはなくなる
  const [done] = collectSubagents([...events, makeEvent(5, "tool_result", { tool_use_id: "b1", content: "ok", is_error: false, parent: "tu1" }, { created_at: "2026-11-03T12:20:00Z" })], {}, true);
  assert.deepEqual([done.lastActivityAt, done.pendingTool], ["2026-11-03T12:20:00Z", undefined]);
  // ほかのサブエージェント・メインの動きでは進めない
  const [other] = collectSubagents([...events, makeEvent(5, "text", { text: "メインの返答" }, { created_at: "2026-11-03T12:30:00Z" })], {}, true);
  assert.equal(other.lastActivityAt, "2026-11-03T12:02:00Z");
});

test("サブエージェントの報告の受け渡し: 待つ形はツールの結果で受け取り、裏で動かしたものは報告のあとに親が動いたら受け取り", () => {
  const launch = (n: number, key: string, agent: string) => [
    makeEvent(n, "tool_use", { id: key, name: "Agent", input: { description: key } }),
    makeEvent(n + 1, "tool_result", { tool_use_id: key, is_error: false, content: `Async agent launched successfully.\nagentId: ${agent}` }),
    makeEvent(n + 2, "subagent", { task_id: agent, tool_use_id: key, description: key, status: "running" }),
  ];
  // 待つ形: 結果が返れば受け取っている
  const foreground = [
    makeEvent(1, "tool_use", { id: "fg", name: "Agent", input: { description: "fg" } }),
    makeEvent(2, "tool_result", { tool_use_id: "fg", is_error: false, content: "報告です" }),
  ];
  assert.equal(collectSubagents(foreground, {}, false)[0].delivery, "received");

  // 裏で動かした: 完了の知らせのあと、親がまだ動いていなければ受け取り待ち
  const sent = [...launch(1, "bg", "a1"), makeEvent(4, "subagent", { task_id: "a1", tool_use_id: "bg", description: "", status: "completed", summary: "報告" })];
  assert.equal(collectSubagents(sent, {}, true)[0].delivery, "pending");
  // 親が動いた（返答を書いた）: 受け取った
  const received = [...sent, makeEvent(5, "text", { text: "報告を読みました" })];
  assert.equal(collectSubagents(received, {}, false)[0].delivery, "received");
  // サブエージェントの中の発言は、親の動きに数えない
  assert.equal(collectSubagents([...sent, makeEvent(5, "text", { text: "中", parent: "bg" })], {}, true)[0].delivery, "pending");
  // 親が動かないまま作業が終わった: 届いていない（親に渡し直す報告の本文も持つ）
  const lost = [...sent, makeEvent(5, "result", { status: "cancelled" })];
  const [gone] = collectSubagents(lost, {}, false);
  assert.deepEqual([gone.delivery, gone.undeliveredReport], ["lost", "報告"]);
  // 報告を渡した（SubagentHandback）あとに親が動いても受け取った
  const handback = [...launch(1, "hb", "a2"), makeEvent(4, "tool_use", { id: "h", name: "SubagentHandback", parent: "hb", input: { message: "渡した報告" } }), makeEvent(5, "tool_use", { id: "m", name: "Read", input: {} })];
  assert.equal(collectSubagents(handback, {}, true, new Set()).find((s) => s.key === "hb")?.delivery, "received");
  // 再開したら、前の回の受け渡しは数え直す
  const resumed = [...received, makeEvent(6, "tool_use", { id: "sm", name: "SendMessage", input: { to: "a1" } }), makeEvent(7, "subagent", { task_id: "a1", tool_use_id: "sm", description: "", status: "running" })];
  assert.equal(collectSubagents(resumed, {}, true)[0].delivery, undefined);
});

test("サブエージェント: 出力の上限（max_output_tokens）で止まった失敗を見分ける（通信の切断とは別）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "tu", name: "Agent", input: { description: "長い報告" } }),
    makeEvent(2, "subagent", { task_id: "a", tool_use_id: "tu", description: "", status: "running" }),
    makeEvent(3, "subagent", {
      task_id: "a",
      tool_use_id: "tu",
      description: "",
      status: "failed",
      summary: "Agent terminated early due to an API error: API Error: Claude's response exceeded the 8192 output token maximum. (error type max_output_tokens)",
    }),
  ];
  const [s] = collectSubagents(events, {}, false);
  assert.deepEqual([s.status, s.outputLimit, s.network], ["failed", true, false]);
  assert.equal(isOutputLimitError("API Error: Connection dropped (ECONNRESET)"), false);
});
