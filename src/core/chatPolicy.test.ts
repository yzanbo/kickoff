import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt, CHAT_POLICY } from "./chatPolicy.js";
import { toAllowedTools } from "./providers/claudePolicy.js";
import { Store } from "./store.js";

function project(references: { path: string; kind: "folder" | "file" }[] = []) {
  const store = new Store(":memory:");
  const p = store.createProject({ name: "a", description: "メモアプリ", repo_path: "/tmp/a", provider: "claude" });
  return store.updateProject(p.id, { references });
}

test("どのチャットも同じ権限: Git の読み取りとテスト・ビルドは承認なし、ファイルの編集は権限モードに任せる", () => {
  const rules = toAllowedTools(CHAT_POLICY);
  assert.ok(rules.includes("Bash(git status:*)"));
  assert.ok(rules.includes("Bash(npm test:*)"));
  assert.ok(rules.includes("WebSearch"));
  assert.ok(!rules.includes("Edit"));
  assert.ok(!rules.some((r) => r.startsWith("Bash(git commit") || r.startsWith("mcp__")));
});

test("指示はセクション・タスク・成果物に触れず、プロジェクト・参照資料だけを伝える", () => {
  const prompt = buildSystemPrompt(project([{ path: "/tmp/spec", kind: "folder" }]));
  assert.ok(prompt.includes("日本語"));
  assert.ok(prompt.includes("- 名前: a"));
  assert.ok(prompt.includes("メモアプリ"));
  assert.ok(prompt.includes("- /tmp/spec/（フォルダ）"));
  for (const word of ["セクション", "タスク", "成果物", "mcp__kickoff__", "テストコマンド", "デプロイ", "コミット"]) {
    assert.ok(!prompt.includes(word), word);
  }
});

test("ワークツリーのチャット: 指示の「リポジトリ」は作業場所にし、本体は場所だけ添える", () => {
  const p = project();
  const prompt = buildSystemPrompt(p, "/tmp/a-worktrees/x");
  assert.ok(prompt.includes("- リポジトリ: /tmp/a-worktrees/x"));
  assert.ok(prompt.includes("- 本体のフォルダ: /tmp/a"));
  // 本体で作業するチャットは、いままでどおり
  const main = buildSystemPrompt(p);
  assert.ok(main.includes("- リポジトリ: /tmp/a"));
  assert.ok(!main.includes("本体のフォルダ"));
});

test("指示: 通信のエラーで止まったサブエージェントは 1 回だけ続きから再開し、ほかの失敗・利用者が止めたものは再開しない", () => {
  const prompt = buildSystemPrompt(project([]));
  assert.match(prompt, /API・通信のエラー/);
  assert.match(prompt, /1 回だけ再開/);
  assert.match(prompt, /利用者が止めたもの（中断）は、再開も立ち上げ直しもせず/);
});

test("指示: 出力の上限（max_output_tokens）で止まったサブエージェントは、短く分けるよう添えて 1 回だけ続きを頼む（通信のエラーとは分ける）", () => {
  const prompt = buildSystemPrompt(project([]));
  assert.match(prompt, /max_output_tokens/);
  assert.match(prompt, /報告は短くまとめる/);
  assert.match(prompt, /大きなファイルは何回かに分けて書く/);
});
