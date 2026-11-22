import assert from "node:assert/strict";
import { test } from "vitest";
import { createToolText } from "@shared/chat/toolText";
import { CLAUDE_CODE_TOOLS } from "@shared/ai/claudeTools";
import { AI_TOOL_VIEWS } from "./aiToolViews";
import { AI_LIST_FAMILY_TOOL, AI_UPDATE_CHAT_TOOL } from "@shared/chat/aiChatEdit";
import { AI_CREATE_CHAT_TOOL } from "@shared/chat/aiCreateChat";
import { AI_ADD_DRAFT_TOOL, AI_OPEN_CHAT_TOOL, AI_OPEN_DIFF_TOOL, AI_OPEN_FILE_TOOL, AI_OPEN_NOTE_TOOL, AI_OPEN_SQL_TOOL } from "@shared/chat/aiOpen";
import { AI_ADD_SNIPPET_TOOL, AI_MOVE_NOTE_TOOL } from "@shared/chat/aiProject";
import { AI_LIST_PROJECT_CHATS_TOOL, AI_READ_CHAT_TOOL, AI_USAGE_TOOL } from "@shared/chat/aiRead";
import { AI_LIST_TERMINALS_TOOL, AI_READ_TERMINAL_TOOL } from "@shared/terminal/aiTerminal";
import { AI_START_SANDBOX_DIAGNOSTICS_TOOL, AI_READ_SANDBOX_DENIALS_TOOL } from "@shared/guard/aiSandboxDiagnostics";
import { AI_FINISH_WORKTREE_TOOL } from "@shared/worktrees/aiWorktree";
import { AI_CANCEL_WORKPLACE_MOVE_TOOL, AI_MOVE_WORKPLACE_TOOL } from "@shared/workplaceMove/aiWorkplace";
import { AI_ARCHIVE_CHAT_TOOL, AI_DELETE_CHAT_TOOL } from "@shared/chat/aiChatRemove";
import { NOTIFY_USER_VIEW } from "@shared/notifications/tools";
import { aiToolId } from "@shared/foundation/aiToolView";

const { describeApprovalInput, describeTool, toolLabel } = createToolText(AI_TOOL_VIEWS);

test("表の全部のツールに表示名があり、名前は重ならない（Kickoff のツールと Claude Code のツール）", () => {
  const ids = AI_TOOL_VIEWS.map(aiToolId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(!toolLabel(id).startsWith("kickoff_"), id);
  for (const name of Object.keys(CLAUDE_CODE_TOOLS)) assert.ok(toolLabel(name) !== name, name);
});


test("OS の拒否ログ診断は、Claude Code・Codex 共通の名前を日本語にする", () => {
  assert.equal(describeTool(AI_START_SANDBOX_DIAGNOSTICS_TOOL, {}), "OS の拒否ログの診断を始める");
  assert.equal(describeTool(AI_READ_SANDBOX_DENIALS_TOOL, {}), "OS の拒否ログを読む");
});

test("AI がチャットを作るツール: 行は何を作ったかと名前（なければ依頼の 1 行目）・ワークツリー、承認カードは依頼の全文", () => {
  assert.equal(describeTool(AI_CREATE_CHAT_TOOL, { relation: "child", title: "ログの調査", text: "ログの形式を調べて" }), "チャットを作る: 子チャット「ログの調査」");
  assert.equal(describeTool(AI_CREATE_CHAT_TOOL, { relation: "root", text: "1 行目\n2 行目", worktree_branch: "feat/a" }), "チャットを作る: 親のないチャット「1 行目」（ワークツリー feat/a）");
  assert.equal(describeTool(AI_CREATE_CHAT_TOOL, { relation: "sibling", text: "別の観点" }), "チャットを作る: 兄弟チャット「別の観点」");
  assert.equal(describeApprovalInput(AI_CREATE_CHAT_TOOL, { relation: "child", title: "ログの調査", text: "1 行目\n2 行目" }), "1 行目\n2 行目");
});

test("AI がチャットの名前・固定・グループを変えるツール: 行は引数から作った「どのチャットの何を変えたか」", () => {
  assert.equal(describeTool(AI_LIST_FAMILY_TOOL, {}), "同じ家系のチャットを確かめる");
  assert.equal(describeTool(AI_UPDATE_CHAT_TOOL, { chat_id: 12, title: "【済】調査", pinned: true }), "チャットを変更: 名前を『【済】調査』に変えた・固定した（チャット 12）");
  assert.equal(describeTool(AI_UPDATE_CHAT_TOOL, { chat_id: 3, group_id: null }), "チャットを変更: グループから外した（チャット 3）");
});

test("AI がノート・チャットを開くツール: 何をどこに開いたか（場所を省いたら付けない）", () => {
  assert.equal(describeTool(AI_OPEN_NOTE_TOOL, { path: "機能の仕様/図.html", place: "window" }), "ノートを開く: 機能の仕様/図.html（別ウィンドウ）");
  assert.equal(describeTool(AI_OPEN_NOTE_TOOL, { path: "ノート.md" }), "ノートを開く: ノート.md");
  assert.equal(describeTool(AI_OPEN_CHAT_TOOL, { chat_id: 12, place: "side" }), "チャットを開く: チャット 12（右の欄）");
  assert.equal(describeTool(AI_OPEN_CHAT_TOOL, { chat_id: 3, place: "どこか" }), "チャットを開く: チャット 3");
});

test("AI が読むだけのツール: 一覧・使用枠は名前だけ、会話はどのチャットをどこから読んだか", () => {
  assert.equal(describeTool(AI_LIST_PROJECT_CHATS_TOOL, {}), "プロジェクトのチャットを確かめる");
  assert.equal(describeTool(AI_USAGE_TOOL, {}), "使用枠を確かめる");
  assert.equal(describeTool(AI_READ_CHAT_TOOL, { chat_id: 12 }), "チャットの会話を読む: チャット 12");
  assert.equal(describeTool(AI_READ_CHAT_TOOL, { chat_id: 12, before: 38, turns: 5 }), "チャットの会話を読む: チャット 12（38 回目より前）");
});

test("AI がプロジェクトに足す・変えるツール: 定型文は名前（なければ 1 行目）、ノートは移す前と後", () => {
  assert.equal(describeTool(AI_ADD_SNIPPET_TOOL, { text: "テストを流して", label: "テスト" }), "定型文に登録: テスト");
  assert.equal(describeTool(AI_ADD_SNIPPET_TOOL, { text: "型を確かめて\n二行目" }), "定型文に登録: 型を確かめて");
  assert.equal(describeTool(AI_MOVE_NOTE_TOOL, { from: "案.md", to: "済/案.md" }), "ノートを移動: 案.md → 済/案.md");
});

test("AI が画面に頼むツール: 開いたファイル・差分・SQL と、下書きを入れたチャット", () => {
  assert.equal(describeTool(AI_OPEN_FILE_TOOL, { path: "src/a.ts", line: 12, place: "window" }), "ファイルを開く: src/a.ts:12（別ウィンドウ）");
  assert.equal(describeTool(AI_OPEN_DIFF_TOOL, {}), "差分を開く: 変更の全体");
  assert.equal(describeTool(AI_OPEN_DIFF_TOOL, { path: "src/a.ts", place: "side" }), "差分を開く: src/a.ts（右の欄）");
  assert.equal(describeTool(AI_OPEN_SQL_TOOL, { connection: "開発", sql: "UPDATE users\nSET a = 1" }), "SQL のタブに入れる: 開発: UPDATE users");
  assert.equal(describeTool(AI_ADD_DRAFT_TOOL, { chat_id: 3, text: "a" }), "下書きを入れる: チャット 3");
});

test("AI がターミナルを読むツール: 一覧は名前だけ、出力は読んだ行の数を渡したときだけ添える", () => {
  assert.equal(describeTool(AI_LIST_TERMINALS_TOOL, {}), "ターミナルを確かめる");
  assert.equal(describeTool(AI_READ_TERMINAL_TOOL, { terminal: "terminal:1:a" }), "ターミナルの出力を読む");
  assert.equal(describeTool(AI_READ_TERMINAL_TOOL, { terminal: "terminal:1:a", lines: 50 }), "ターミナルの出力を読む: 最後の 50 行");
});

test("AI がワークツリーを片付けるツール: 行はどのワークツリーか（省いたらこのチャットのワークツリー）", () => {
  assert.equal(describeTool(AI_FINISH_WORKTREE_TOOL, { worktree: "feat/a" }), "ワークツリーを片付ける: feat/a");
  assert.equal(describeTool(AI_FINISH_WORKTREE_TOOL, {}), "ワークツリーを片付ける: このチャットのワークツリー");
  assert.equal(describeTool(AI_MOVE_WORKPLACE_TOOL, { to: "new_worktree", branch: "feat/a", carry: true }), "作業場所を移す予約: 新しいワークツリー（feat/a）（変更を持っていく）");
  assert.equal(describeTool(AI_CANCEL_WORKPLACE_MOVE_TOOL, {}), "作業場所を移す予約を取り消す");
});

test("AI がチャットをアーカイブする・消すツール: 行はどのチャットか", () => {
  assert.equal(describeTool(AI_ARCHIVE_CHAT_TOOL, { chat_id: 7 }), "チャットをアーカイブ: チャット 7");
  assert.equal(describeTool(AI_DELETE_CHAT_TOOL, { chat_id: 8 }), "チャットをゴミ箱へ: チャット 8");
});

test("AI が利用者に知らせるツール: 行は知らせた文", () => {
  assert.equal(describeTool(aiToolId(NOTIFY_USER_VIEW), { message: "1 段目が済みました" }), "利用者に知らせる: 1 段目が済みました");
});

test("ブラウザと DB のツールは表示名と記録の行の 1 文で出す", () => {
  assert.equal(describeTool("mcp__kickoff_browser__browser_open", { url: "http://localhost:3000" }), "ページを開く: http://localhost:3000");
  assert.equal(describeTool("mcp__kickoff_browser__browser_click", { ref: 3 }), "ページをクリック: ref 3");
  assert.equal(describeTool("mcp__kickoff_browser__browser_read", { tab_id: 1 }), "ページを読む");
  assert.equal(describeTool("mcp__kickoff_db__db_query", { connection: "開発", sql: "SELECT 1\nFROM t" }), "SQL を流す: 開発: SELECT 1");
  assert.equal(toolLabel("mcp__kickoff_db__db_connections"), "DB の接続を確かめる");
});
