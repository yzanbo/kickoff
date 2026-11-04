import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, ChatEventOf } from "@shared/types";
import { groupEvents, relativize, summarizeTools, type ToolCall } from "./timelineItems";

let nextId = 1;
const call = (name: string, input: object = {}): ToolCall => ({
  use: { id: nextId++, chat_id: 1, type: "tool_use", data: { id: `tu${nextId}`, name, input }, created_at: "2026-11-01T00:00:00Z" } as unknown as ChatEventOf<"tool_use">,
});

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

const event = (id: number, type: string, data: object = {}): ChatEvent => ({ id, chat_id: 1, type, data, created_at: "2026-11-01T00:00:00Z" }) as unknown as ChatEvent;

test("groupEvents: 連続するツールの実行を 1 つにまとめ、結果は呼び出しにぶら下げる。init・thinking などは出さない", () => {
  const items = groupEvents([
    event(1, "init"),
    event(2, "user", { text: "やって" }),
    event(3, "tool_use", { id: "a", name: "Read", input: {} }),
    event(4, "tool_result", { tool_use_id: "a", content: "ok" }),
    event(5, "tool_use", { id: "b", name: "Bash", input: {} }),
    event(6, "thinking", { text: "" }),
    event(7, "text", { text: "できました" }),
    event(8, "tool_use", { id: "c", name: "Edit", input: {} }),
    // 対応する呼び出しがない結果は捨てる
    event(9, "tool_result", { tool_use_id: "zzz" }),
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

test("groupEvents: parent を渡すとそのサブエージェントの分だけ、渡さなければ親のエージェントの分だけ", () => {
  const events = [event(1, "text", { text: "親" }), event(2, "text", { text: "子", parent: "sub1" }), event(3, "tool_use", { id: "x", name: "Read", parent: "sub1" })];
  assert.deepEqual(
    groupEvents(events).map((i) => i.key),
    ["e1"],
  );
  assert.deepEqual(
    groupEvents(events, "sub1").map((i) => i.key),
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
  const at = (id: number, type: string, time: string, data: object = {}) => ({ ...event(id, type, data), created_at: time });
  const items = groupEvents([
    at(1, "user", "2026-11-01T00:00:00Z", { text: "1 回目" }),
    at(10, "text", "2026-11-01T00:00:30Z", { text: "答え 1" }),
    at(11, "text", "2026-11-01T00:00:40Z", { text: "サブ", parent: "x" }),
    at(12, "text", "2026-11-01T00:00:50Z", { text: "答え 2" }),
    at(2, "result", "2026-11-01T00:01:23Z", { status: "completed" }),
    at(3, "user", "2026-11-01T00:05:00Z", { text: "2 回目" }),
    at(4, "user", "2026-11-01T00:05:10Z", { text: "追加" }),
    at(5, "result", "2026-11-01T00:06:00Z", { status: "cancelled" }),
    at(6, "result", "2026-11-01T00:07:00Z", { status: "completed" }),
  ]);
  const starts = items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnStart] : []));
  // 続けて送ったときは最初の発言から数え、発言のない result には付けない
  assert.deepEqual(starts, ["2026-11-01T00:00:00Z", "2026-11-01T00:05:00Z", undefined]);
  // コピーする返答は、その作業での AI の返答だけ（サブエージェントの発言は含めない）
  const texts = items.flatMap((i) => (i.kind === "event" && i.event.type === "result" ? [i.turnText] : []));
  assert.deepEqual(texts, ["答え 1\n\n答え 2", undefined, undefined]);
});

test("groupEvents: 思考は、中身があるか 2 秒以上考えたものだけ出す（短い思考ではツールのまとまりを分けない）", () => {
  const items = groupEvents([
    event(1, "tool_use", { id: "a", name: "Read", input: {} }),
    event(2, "thinking", { text: "", duration_ms: 800 }),
    event(3, "tool_use", { id: "b", name: "Read", input: {} }),
    event(4, "thinking", { text: "", duration_ms: 8_000 }),
    event(5, "thinking", { text: "考えたこと" }),
    event(6, "thinking", { text: "" }),
  ]);
  assert.deepEqual(
    items.map((i) => (i.kind === "tools" ? `tools:${i.tools.length}` : i.event.id)),
    ["tools:2", 4, 5],
  );
});
