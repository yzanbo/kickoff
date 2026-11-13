import assert from "node:assert/strict";
import { test } from "node:test";
import { describeApprovalInput, describeTool, describeToolInput, describeUnknownInput, toolLabel, visibleToolResult } from "./toolDescribe";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CHILD_CHAT_TOOL } from "@shared/chat/aiChildChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_MEMO_TOOL, AI_OPEN_SQL_TOOL } from "@shared/chat/aiOpen";
import { AI_ADD_SNIPPET_TOOL, AI_MOVE_MEMO_TOOL } from "@shared/chat/aiProject";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL } from "@shared/chat/aiRead";

test("ToDo のツール: 追加・更新・一覧・確認を文にする", () => {
  assert.equal(describeTool("TaskCreate", { subject: "確認 1", description: "動作確認用タスク 1" }), "ToDo を追加: 確認 1");
  assert.equal(describeTool("TaskUpdate", { taskId: "1", status: "completed" }), "ToDo を更新: #1 → 完了");
  assert.equal(describeTool("TaskUpdate", { taskId: "2", status: "in_progress" }), "ToDo を更新: #2 → 作業中");
  assert.equal(describeTool("TaskUpdate", { taskId: "3", status: "deleted" }), "ToDo を更新: #3 → 削除");
  assert.equal(describeTool("TaskUpdate", { taskId: "4", status: "pending", subject: "新しい名前" }), "ToDo を更新: #4 → 未着手（名前: 新しい名前）");
  assert.equal(describeTool("TaskUpdate", { taskId: "5", description: "…", addBlockedBy: ["1", "2"] }), "ToDo を更新: #5（説明を変更・#1・#2 の後）");
  assert.equal(describeTool("TaskList", {}), "ToDo の一覧");
  assert.equal(describeTool("TaskGet", { taskId: "7" }), "ToDo を確認: #7");
  assert.equal(
    describeTool("TodoWrite", {
      todos: [
        { content: "a", status: "completed" },
        { content: "b", status: "in_progress" },
        { content: "c", status: "pending" },
      ],
    }),
    "ToDo: 3件（完了 1・作業中 1）",
  );
});

test("ツール検索・スキル・計画・質問・Web・メッセージ", () => {
  assert.equal(describeTool("ToolSearch", { query: "select:TaskCreate,TaskUpdate", max_results: 2 }), "ツール検索: TaskCreate, TaskUpdate");
  assert.equal(describeTool("ToolSearch", { query: "notebook jupyter" }), "ツール検索: notebook jupyter");
  assert.equal(describeTool("Skill", { skill: "code-review", args: "high" }), "スキル: code-review high");
  assert.equal(describeTool("ExitPlanMode", { plan: "# 計画の見出し\n\n1. やること" }), "計画を提示: 計画の見出し");
  assert.equal(describeTool("WebFetch", { url: "https://example.com", prompt: "要約して" }), "ページを取得: https://example.com");
  assert.equal(describeTool("WebSearch", { query: "Electron" }), "Web 検索: Electron");
  assert.equal(describeTool("AskUserQuestion", { questions: [{ question: "どれにしますか？" }, { question: "いつ？" }] }), "質問: どれにしますか？（ほか 1 件）");
  assert.equal(describeTool("SendMessage", { to: "agent-1", message: "続けて" }), "メッセージ: agent-1: 続けて");
  assert.equal(describeTool("TaskStop", { task_id: "b1" }), "作業を停止: b1");
  assert.equal(describeTool("NotebookEdit", { notebook_path: "/a/n.ipynb", cell_id: "c3", new_source: "x" }), "編集: /a/n.ipynb（セル c3）");
  assert.equal(describeTool("Grep", { pattern: "useState", path: "/repo/src" }), "検索: useState（/repo/src）");
});

test("ファイル・コマンド・サブエージェントは今までどおり", () => {
  assert.equal(describeToolInput("Bash", { command: "npm test", description: "テスト" }), "npm test");
  assert.equal(describeToolInput("Read", { file_path: "/repo/a.ts" }), "/repo/a.ts");
  assert.equal(describeToolInput("Edit", { file_path: "/repo/a.ts", old_string: "a", new_string: "b" }), "/repo/a.ts");
  assert.equal(describeToolInput("Agent", { description: "調べる", subagent_type: "Explore", prompt: "…" }), "調べる（Explore）");
  assert.equal(toolLabel("Read"), "読む");
});

test("MCP のツール: Kickoff は「Kickoff」、ほかはサーバーの名前とツールの名前", () => {
  assert.equal(describeTool("mcp__kickoff__create_task", { title: "雛形の作成", priority: 1 }), "Kickoff: タスクを作成: 雛形の作成");
  assert.equal(describeTool("mcp__kickoff__list_tasks", {}), "Kickoff: タスクの一覧");
  assert.equal(describeTool("mcp__kickoff__save_artifact", { title: "要件定義書", content: "…" }), "Kickoff: 成果物を保存: 要件定義書");
  assert.equal(describeTool("mcp__github__get_issue", { owner: "me", number: 3 }), "github: get_issue owner: me、number: 3");
});

test("知らないツール: JSON ではなく key: value を短く並べる（長い値・配列・入れ子は省く）", () => {
  assert.equal(describeTool("Mystery", { a: "x", n: 2, flag: true, empty: "", none: null }), "Mystery: a: x、n: 2、flag: true");
  assert.equal(describeUnknownInput({ text: "あ".repeat(50), list: [1, 2, 3], obj: { k: 1 } }), `text: ${"あ".repeat(40)}…、list: 3件、obj: {…}`);
  assert.equal(describeUnknownInput({ a: 1, b: 2, c: 3, d: 4, e: 5 }), "a: 1、b: 2、c: 3、d: 4 …");
  assert.equal(describeUnknownInput({ s: "1 行目\n2 行目" }), "s: 1 行目 2 行目");
  assert.equal(describeTool("Mystery", {}), "Mystery");
  // 知らないツールでも、ファイル・URL などがあればそれを出す
  assert.equal(describeToolInput("Mystery", { file_path: "/a/b.ts", x: 1 }), "/a/b.ts");
});

test("承認カード: 計画の提示は全文、ほかは 1 行と同じ", () => {
  assert.equal(describeApprovalInput("ExitPlanMode", { plan: "# 計画\n\n1. やる" }), "# 計画\n\n1. やる");
  assert.equal(describeApprovalInput("Bash", { command: "rm -rf dist" }), "rm -rf dist");
});

test("ツールの結果: ツール検索の [tool_reference] は出さない", () => {
  assert.equal(visibleToolResult("[tool_reference]\n[tool_reference]"), "");
  assert.equal(visibleToolResult("Task #1 created successfully: 確認 1"), "Task #1 created successfully: 確認 1");
  assert.equal(visibleToolResult("見つかった\n[tool_reference]"), "見つかった");
});

test("AI が子チャットを作るツール: 行は名前（なければ依頼の 1 行目）、承認カードは依頼の全文", () => {
  assert.equal(describeTool(AI_CHILD_CHAT_TOOL, { title: "ログの調査", text: "ログの形式を調べて" }), "子チャットを作る: ログの調査");
  assert.equal(describeTool(AI_CHILD_CHAT_TOOL, { text: "1 行目\n2 行目" }), "子チャットを作る: 1 行目");
  assert.equal(describeApprovalInput(AI_CHILD_CHAT_TOOL, { title: "ログの調査", text: "1 行目\n2 行目" }), "1 行目\n2 行目");
});

test("AI がチャットの名前・固定・グループを変えるツール: 行は引数から作った「どのチャットの何を変えたか」", () => {
  assert.equal(describeTool(AI_LIST_FAMILY_TOOL, {}), "同じ家系のチャットを確かめる");
  assert.equal(describeTool(AI_UPDATE_CHAT_TOOL, { chat_id: 12, title: "【済】調査", pinned: true }), "チャットを変更: 名前を『【済】調査』に変えた・固定した（チャット 12）");
  assert.equal(describeTool(AI_UPDATE_CHAT_TOOL, { chat_id: 3, group_id: null }), "チャットを変更: グループから外した（チャット 3）");
});

test("AI がメモ・チャットを開くツール: 何をどこに開いたか（場所を省いたら付けない）", () => {
  assert.equal(describeTool(AI_OPEN_MEMO_TOOL, { path: "機能の仕様/図.html", place: "window" }), "メモを開く: 機能の仕様/図.html（別ウィンドウ）");
  assert.equal(describeTool(AI_OPEN_MEMO_TOOL, { path: "メモ.md" }), "メモを開く: メモ.md");
  assert.equal(describeTool(AI_OPEN_CHAT_TOOL, { chat_id: 12, place: "side" }), "チャットを開く: チャット 12（右の欄）");
  assert.equal(describeTool(AI_OPEN_CHAT_TOOL, { chat_id: 3, place: "どこか" }), "チャットを開く: チャット 3");
});

test("AI が読むだけのツール: 一覧・使用枠は名前だけ、会話はどのチャットをどこから読んだか", () => {
  assert.equal(describeTool(AI_LIST_PROJECT_CHATS_TOOL, {}), "プロジェクトのチャットを確かめる");
  assert.equal(describeTool(AI_USAGE_TOOL, {}), "使用枠を確かめる");
  assert.equal(describeTool(AI_READ_CHAT_TOOL, { chat_id: 12 }), "チャットの会話を読む: チャット 12");
  assert.equal(describeTool(AI_READ_CHAT_TOOL, { chat_id: 12, before: 38, turns: 5 }), "チャットの会話を読む: チャット 12（38 回目より前）");
});

test("AI がプロジェクトに足す・変えるツール: 定型文は名前（なければ 1 行目）、メモは移す前と後", () => {
  assert.equal(describeTool(AI_ADD_SNIPPET_TOOL, { text: "テストを流して", label: "テスト" }), "定型文に登録: テスト");
  assert.equal(describeTool(AI_ADD_SNIPPET_TOOL, { text: "型を確かめて\n二行目" }), "定型文に登録: 型を確かめて");
  assert.equal(describeTool(AI_MOVE_MEMO_TOOL, { from: "案.md", to: "済/案.md" }), "メモを移動: 案.md → 済/案.md");
});

test("AI が画面に頼むツール: 開いたファイル・差分・SQL と、下書きを入れたチャット", () => {
  assert.equal(describeTool(AI_OPEN_FILE_TOOL, { path: "src/a.ts", line: 12, place: "window" }), "ファイルを開く: src/a.ts:12（別ウィンドウ）");
  assert.equal(describeTool(AI_OPEN_DIFF_TOOL, {}), "差分を開く: 変更の全体");
  assert.equal(describeTool(AI_OPEN_DIFF_TOOL, { path: "src/a.ts", place: "side" }), "差分を開く: src/a.ts（右の欄）");
  assert.equal(describeTool(AI_OPEN_SQL_TOOL, { connection: "開発", sql: "UPDATE users\nSET a = 1" }), "SQL のタブに入れる: 開発: UPDATE users");
  assert.equal(describeTool(AI_ADD_DRAFT_TOOL, { chat_id: 3, text: "a" }), "下書きを入れる: チャット 3");
});
