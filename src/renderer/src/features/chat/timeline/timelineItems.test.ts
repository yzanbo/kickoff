import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence, makeEvent } from "@shared/testing/factories";
import { groupEvents, relativize, summarizeTools, type ToolCall } from "./timelineItems";

const use = eventSequence();
let tools = 0;
const call = (name: string, input: object = {}): ToolCall => ({ use: use("tool_use", { id: `tu${++tools}`, name, input }) });

test("ツールのまとまりの要約: 編集・読み取りはファイルの数、それ以外は回数で 1 文にする", () => {
  assert.equal(
    summarizeTools([call("Bash"), call("Bash"), call("Bash"), call("Bash"), call("TodoWrite"), call("WebFetch"), call("ToolSearch"), call("AskUserQuestion")]),
    "4個のコマンドを実行、1件のページを取得、ToDo を1件更新、ツールを1回検索 および 1件の質問",
  );
  // 同じファイルを何度編集しても 1 個と数える
  assert.equal(
    summarizeTools([call("Edit", { file_path: "a.ts" }), call("Edit", { file_path: "a.ts" }), call("Write", { file_path: "b.ts" }), call("Read", { file_path: "a.ts" }), call("Grep"), call("Glob")]),
    "2個のファイルを編集、1個のファイルを読み取り および 2回検索",
  );
  assert.equal(summarizeTools([call("Agent"), call("Task")]), "サブエージェントを2件起動");
  assert.equal(summarizeTools([call("mcp__kickoff__create_task"), call("Bash")]), "1個のコマンドを実行 および Kickoff を1回使用");
  assert.equal(summarizeTools([]), "");
});

test("ツールのまとまりの要約: ToDo・ツール検索・スキル・ページの取得などを種類ごとに数え、分類できないものだけ「その他」", () => {
  assert.equal(summarizeTools([call("TaskUpdate"), call("TaskUpdate"), call("TaskUpdate"), call("TaskUpdate")]), "ToDo を4件更新");
  assert.equal(summarizeTools([call("ToolSearch"), call("TaskCreate"), call("TaskCreate"), call("ToolSearch")]), "ToDo を2件追加 および ツールを2回検索");
  assert.equal(summarizeTools([call("Skill"), call("WebFetch"), call("WebFetch")]), "2件のページを取得 および スキルを1回使用");
  assert.equal(summarizeTools([call("TaskList"), call("TaskGet")]), "ToDo を2回確認");
  assert.equal(summarizeTools([call("TaskStop"), call("TaskOutput"), call("ExitPlanMode")]), "作業の様子を1回確認、作業を1件停止 および 計画を1回提示");
  assert.equal(summarizeTools([call("mcp__github__get_issue"), call("Mystery"), call("Mystery")]), "MCP のツールを1回使用 および その他のツールを2回使用");
});

test("groupEvents: 連続するツールの実行を 1 つにまとめ、結果は呼び出しにぶら下げる。init・thinking などは出さない", () => {
  const items = groupEvents([
    makeEvent(1, "init", { session_id: "s1" }),
    makeEvent(2, "user", { text: "やって" }),
    makeEvent(3, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "a", content: "ok" }),
    makeEvent(5, "tool_use", { id: "b", name: "Bash", input: {} }),
    makeEvent(6, "thinking", { text: "" }),
    makeEvent(7, "text", { text: "できました" }),
    makeEvent(8, "tool_use", { id: "c", name: "Edit", input: {} }),
    // 対応する呼び出しがない結果は捨てる
    makeEvent(9, "tool_result", { tool_use_id: "zzz", content: "" }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["event:e2", "tools:t3", "event:e7", "tools:t8"],
  );
  const tools = items[1];
  assert.ok(tools.kind === "tools");
  assert.deepEqual(
    tools.tools.map((t) => [t.use.id, t.result?.id]),
    [
      [3, 4],
      [5, undefined],
    ],
  );
});

test("groupEvents: parent を渡すとそのサブエージェントの分だけ、渡さなければメインエージェントの分だけ", () => {
  const events = [makeEvent(1, "text", { text: "親" }), makeEvent(2, "text", { text: "子", parent: "sub1" }), makeEvent(3, "tool_use", { id: "x", name: "Read", input: {}, parent: "sub1" })];
  assert.deepEqual(
    groupEvents(events).map((i) => i.key),
    ["e1"],
  );
  assert.deepEqual(
    groupEvents(events, ["sub1"]).map((i) => i.key),
    ["e2", "t3"],
  );
});

test("relativize: リポジトリの絶対パスを相対パスにする（リポジトリそのものは「.」）", () => {
  const repo = "/Users/me/app";
  assert.equal(relativize("/Users/me/app/src/a.ts を読む", repo), "src/a.ts を読む");
  assert.equal(relativize("cd /Users/me/app && npm test", repo), "cd . && npm test");
  assert.equal(relativize("ほかの /tmp/x", repo), "ほかの /tmp/x");
  assert.equal(relativize("`/Users/me/app` で実行", repo), "`.` で実行");
  // 名前に文字が続く別のパス（隣のワークツリーなど）は変えない
  assert.equal(relativize("/Users/me/app-worktrees/x/src/a.ts", repo), "/Users/me/app-worktrees/x/src/a.ts");
  assert.equal(relativize("/Users/me/app.bak/a と /Users/me/app2/b", repo), "/Users/me/app.bak/a と /Users/me/app2/b");
  // 正規表現で意味のある文字を含むパス
  assert.equal(relativize("/x/app (1)/src/a.ts", "/x/app (1)"), "src/a.ts");
});

test("groupEvents: 作業の終わり（result）に、その作業を始めた自分の発言の時刻と返答の文を付ける", () => {
  const items = groupEvents([
    makeEvent(1, "user", { text: "1 回目" }, { created_at: "2026-11-01T00:00:00Z" }),
    makeEvent(10, "text", { text: "答え 1" }, { created_at: "2026-11-01T00:00:30Z" }),
    makeEvent(11, "text", { text: "サブ", parent: "x" }, { created_at: "2026-11-01T00:00:40Z" }),
    makeEvent(12, "text", { text: "答え 2" }, { created_at: "2026-11-01T00:00:50Z" }),
    makeEvent(2, "result", { status: "completed" }, { created_at: "2026-11-01T00:01:23Z" }),
    makeEvent(3, "user", { text: "2 回目" }, { created_at: "2026-11-01T00:05:00Z" }),
    makeEvent(4, "user", { text: "追加" }, { created_at: "2026-11-01T00:05:10Z" }),
    makeEvent(5, "result", { status: "cancelled" }, { created_at: "2026-11-01T00:06:00Z" }),
    makeEvent(6, "result", { status: "completed" }, { created_at: "2026-11-01T00:07:00Z" }),
  ]);
  const starts = items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnStart] : []));
  // 続けて送ったときは最初の発言から数え、発言のない result には付けない
  assert.deepEqual(starts, ["2026-11-01T00:00:00Z", "2026-11-01T00:05:00Z", undefined]);
  // コピーする返答は、その作業での AI の返答だけ（サブエージェントの発言は含めない）
  const texts = items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnText] : []));
  assert.deepEqual(texts, ["答え 1\n\n答え 2", undefined, undefined]);
});

test("groupEvents: 作業の終わりに、親チャットに渡す最後の返答と、依頼文を頼んだ作業かを付ける（返答がなければ付けない・同じ記録には同じものを渡す）", () => {
  const events = [
    makeEvent(1, "user", { text: "依頼文を", handoff_request: true }),
    makeEvent(2, "text", { text: "確認します" }),
    makeEvent(3, "tool_use", { id: "r1", name: "Read", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "r1", content: "…" }),
    makeEvent(5, "text", { text: "依頼文の本文" }),
    makeEvent(6, "result", { status: "completed" }),
    makeEvent(7, "user", { text: "ふつうの質問" }),
    makeEvent(8, "text", { text: "答え" }),
    makeEvent(9, "result", { status: "completed" }),
    makeEvent(10, "user", { text: "返答なし" }),
    makeEvent(11, "result", { status: "cancelled" }),
  ];
  const handoffs = (items: ReturnType<typeof groupEvents>) =>
    items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnHandoff] : []));
  const first = handoffs(groupEvents(events));
  assert.deepEqual(first, [{ reply: "依頼文の本文", requested: true }, { reply: "答え", requested: false }, undefined]);
  // 組み立て直しても同じもの（memo した終わりの行を描き直させない）
  assert.equal(handoffs(groupEvents(events))[0], first[0]);
});

test("groupEvents: 親チャットに渡した記録は流れに出さず、渡した作業の終わりに渡した順で付ける（増えるまでは同じ配列）", () => {
  const events = [
    makeEvent(1, "user", { text: "依頼文を" }),
    makeEvent(2, "text", { text: "本文" }),
    makeEvent(3, "result", { status: "completed" }),
    makeEvent(4, "user", { text: "次" }),
    makeEvent(5, "text", { text: "答え" }),
    makeEvent(6, "result", { status: "completed" }),
    makeEvent(7, "handoff", { via: "composer", parent_chat_id: 9, turn_event_id: 3 }),
    makeEvent(8, "handoff", { via: "send", parent_chat_id: 9, turn_event_id: 3 }),
  ];
  const marks = (items: ReturnType<typeof groupEvents>) => items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnHandoffs] : []));
  const items = groupEvents(events);
  assert.ok(items.every((i) => i.kind !== "event" || i.event.type !== "handoff"));
  const [first, second] = marks(items);
  assert.deepEqual(first?.map((e) => e.data.via), ["composer", "send"]);
  assert.equal(second, undefined);
  assert.equal(marks(groupEvents(events))[0], first);
  const more = [...events, makeEvent(9, "handoff", { via: "queue", parent_chat_id: 9, turn_event_id: 3 })];
  assert.deepEqual(marks(groupEvents(more))[0]?.map((e) => e.data.via), ["composer", "send", "queue"]);
});

test("groupEvents: 思考は、中身があるか 2 秒以上考えたものだけ出す（短い思考ではツールのまとまりを分けない）", () => {
  const items = groupEvents([
    makeEvent(1, "tool_use", { id: "a", name: "Read", input: {} }),
    makeEvent(2, "thinking", { text: "", duration_ms: 800 }),
    makeEvent(3, "tool_use", { id: "b", name: "Read", input: {} }),
    makeEvent(4, "thinking", { text: "", duration_ms: 8_000 }),
    makeEvent(5, "thinking", { text: "考えたこと" }),
    makeEvent(6, "thinking", { text: "" }),
  ]);
  assert.deepEqual(
    items.map((i) => (i.kind === "tools" ? `tools:${i.tools.length}` : i.kind === "event" ? i.event.id : i.key)),
    ["tools:2", 4, 5],
  );
});

test("groupEvents: サブエージェントの起動はツールのまとまりに入れず、カードの項目にする（前後のツールは別のまとまり）", () => {
  const items = groupEvents([
    makeEvent(1, "tool_use", { id: "b1", name: "Bash", input: {} }),
    makeEvent(2, "tool_use", { id: "a1", name: "Agent", input: { description: "調査" } }),
    makeEvent(3, "tool_use", { id: "b2", name: "Bash", input: {} }),
    makeEvent(4, "tool_result", { tool_use_id: "a1", content: "報告", is_error: false }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["tools:t1", "subagent:s2", "tools:t3"],
  );
  const card = items[1];
  assert.ok(card.kind === "subagent");
  assert.equal(card.call.result?.id, 4);
});

test("groupEvents: サブエージェントの中身は、行のキーと再開した回の呼び出し ID の記録を並べる（入れ子の起動もカード）", () => {
  const events = [
    makeEvent(1, "tool_use", { id: "a1", name: "Agent", input: {} }),
    makeEvent(2, "text", { text: "1 回目", parent: "a1" }),
    makeEvent(3, "tool_use", { id: "a2", name: "Agent", input: {}, parent: "a1" }),
    makeEvent(4, "text", { text: "孫の中", parent: "a2" }),
    makeEvent(5, "text", { text: "再開した回", parent: "sm1" }),
  ];
  assert.deepEqual(
    groupEvents(events, ["a1", "sm1"]).map((i) => i.kind + ":" + i.key),
    ["event:e2", "subagent:s3", "event:e5"],
  );
  assert.deepEqual(
    groupEvents(events, ["a2"]).map((i) => i.key),
    ["e4"],
  );
});

test("groupEvents: 裏で動かしたサブエージェントが終わったら、起動した流れのその時刻の位置に 1 行（待つ形のものには出さない）", () => {
  const launched = "Async agent launched successfully.\nagentId: t1 (internal ID)";
  const events = [
    makeEvent(1, "tool_use", { id: "a1", name: "Agent", input: {} }),
    makeEvent(2, "subagent", { task_id: "t1", tool_use_id: "a1", description: "裏の調査", status: "running" }),
    makeEvent(3, "tool_result", { tool_use_id: "a1", content: launched, is_error: false }),
    makeEvent(4, "tool_use", { id: "a2", name: "Agent", input: {} }),
    makeEvent(5, "tool_use", { id: "a3", name: "Agent", input: {}, parent: "a2" }),
    makeEvent(6, "tool_result", { tool_use_id: "a3", content: "Async agent launched successfully.\nagentId: t3", is_error: false, parent: "a2" }),
    makeEvent(7, "subagent", { task_id: "t3", tool_use_id: "a3", description: "孫", status: "completed" }),
    makeEvent(8, "text", { text: "続き" }),
    makeEvent(9, "subagent", { task_id: "t1", tool_use_id: "a1", description: "", status: "completed" }),
    makeEvent(10, "tool_result", { tool_use_id: "a2", content: "待つ形の報告", is_error: false }),
    makeEvent(11, "subagent", { task_id: "t2", tool_use_id: "a2", description: "待つ形", status: "completed" }),
  ];
  const main = groupEvents(events);
  assert.deepEqual(
    main.map((i) => i.kind + ":" + i.key),
    ["subagent:s1", "subagent:s4", "event:e8", "subagentEnd:x9"],
  );
  const end = main[3];
  assert.ok(end.kind === "subagentEnd");
  assert.equal(end.agentKey, "a1");
  // 入れ子: 孫の終わりは、起動した子の流れに出す
  assert.deepEqual(
    groupEvents(events, ["a2"]).map((i) => i.kind + ":" + i.key),
    ["subagent:s5", "subagentEnd:x7"],
  );
});
