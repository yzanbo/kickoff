import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt, CHAT_POLICY } from "./policy.js";
import { toAllowedTools } from "../providers/claude/policy.js";
import { Store } from "../db/store.js";

function project(references: { path: string; kind: "folder" | "file" }[] = []) {
  const store = new Store(":memory:");
  const p = store.projects.create({ name: "a", description: "メモアプリ", repo_path: "/tmp/a", provider: "claude" });
  return store.projects.update(p.id, { reference_paths: references });
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
  assert.ok(prompt.includes("- 「spec」: `/tmp/spec/`（フォルダ）"));
  for (const word of ["セクション", "タスク", "成果物", "mcp__kickoff__", "テストコマンド", "デプロイ", "コミット"]) {
    assert.ok(!prompt.includes(word), word);
  }
});

test("参照資料: 名前（パスの最後）を添え、「参照資料」・似た名前で言われたらその参照資料のことで、中の場所はそのフォルダから探すよう伝える", () => {
  const prompt = buildSystemPrompt(project([{ path: "/Users/a/Documents/Design Spec", kind: "folder" }, { path: "/Users/a/notes/api.md", kind: "file" }]));
  assert.ok(prompt.includes("- 「Design Spec」: `/Users/a/Documents/Design Spec/`（フォルダ）"));
  assert.ok(prompt.includes("- 「api.md」: `/Users/a/notes/api.md`（ファイル）"));
  assert.match(prompt, /「参照資料」と言ったら、この一覧のフォルダ・ファイルのこと/);
  assert.match(prompt, /完全に同じでなくても/);
  assert.match(prompt, /その参照資料のフォルダからの場所として探して/);
  assert.match(prompt, /候補を挙げて利用者に聞いて/);
  // 参照資料がなければ節ごと出さない
  assert.ok(!buildSystemPrompt(project([])).includes("## 参照資料"));
});

test("フォルダ: プロジェクトフォルダと作業フォルダを呼び名つきで伝え、ワークツリーのチャットは作業フォルダで作業してプロジェクトフォルダは変えないよう伝える", () => {
  const p = project();
  const prompt = buildSystemPrompt(p, "/tmp/a-worktrees/x");
  assert.ok(prompt.includes("- プロジェクトフォルダ: /tmp/a（利用者が「プロジェクトフォルダ」「プロジェクトディレクトリ」「ルートフォルダ」「ルートディレクトリ」「ホームフォルダ」「ホームディレクトリ」と言ったら、このフォルダのこと。"));
  // ファイルの場所の起点にしてもらう。ワークツリーのチャットは、読み書きを作業フォルダの同じ場所で
  assert.ok(prompt.includes("このフォルダからの場所として探してください（読み書きは作業フォルダの中の同じ場所で）"));
  assert.ok(prompt.includes("- 作業フォルダ: /tmp/a-worktrees/x（このチャットはワークツリーで作業しています"));
  // 本体で作業するチャットは、作業フォルダ = プロジェクトフォルダ
  const main = buildSystemPrompt(p);
  assert.ok(main.includes("- 作業フォルダ: プロジェクトフォルダと同じ"));
  assert.ok(main.includes("このフォルダからの場所として探してください）"));
  // 途中で変わることがあるので、ここに書いた場所を使うよう伝える（送るたびに作り直す）
  assert.ok(main.includes("ここに書いた場所がいまの場所です"));
  assert.ok(buildSystemPrompt({ ...p, repo_path: "/tmp/b" }).includes("- プロジェクトフォルダ: /tmp/b"));
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

test("メモ: どのチャットでも「メモ」が「メモ」タブのメモ（フォルダ）のことだと伝え、メモのチャットはどのメモの横かを伝える", () => {
  const p = project();
  const plain = buildSystemPrompt(p, p.repo_path, { dir: "/tmp/memos/a", file: null });
  assert.ok(plain.includes("利用者が「メモ」と言ったら、Kickoff の「メモ」タブのメモのことです"));
  assert.ok(plain.includes("メモフォルダ `/tmp/memos/a`"));
  assert.ok(!plain.includes("の横で話しています"));
  const memoChat = buildSystemPrompt(p, p.repo_path, { dir: "/tmp/memos/a", file: "/tmp/memos/a/x.md" });
  assert.ok(memoChat.includes("`/tmp/memos/a/x.md` の横で話しています"));
  assert.ok(!memoChat.includes("利用者が「メモ」と言ったら"));
  // メモのフォルダが分からなければ、メモのことは書かない
  assert.ok(!buildSystemPrompt(p).includes("## メモ"));
});
