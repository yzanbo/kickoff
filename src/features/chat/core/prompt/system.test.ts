import assert from "node:assert/strict";
import { test } from "vitest";
import type { Project } from "@shared/projects/types";
import type { LinkOpenTarget } from "@shared/settings/types";
import { browserSection, projectSection, referenceSection, TRASH_SECTION, WORK_SECTION } from "./system";
import { joinSections } from "./sections";
import { testStore } from "@/app/core/testing/testStore";

/** 実行と同じ並びで節をつなぐ（chat の節と、まだ機能へ分けていない節。図と数式の節は visuals・ノートの節は notes） */
function buildSystemPrompt(p: Project, workdir = p.repo_path, opts: { trash?: boolean; sandboxLines?: string[]; editScopeEnabled?: boolean; browser?: LinkOpenTarget } = {}): string {
  const references = referenceSection(p);
  return joinSections([
    projectSection(p, workdir, opts.editScopeEnabled),
    WORK_SECTION,
    ...(opts.trash ? [TRASH_SECTION] : []),
    ...(opts.sandboxLines ? [{ order: 220, heading: null, lines: opts.sandboxLines }] : []), // 砂場の行（guard の contributor が作る節）
    ...(opts.browser ? [browserSection(opts.browser)] : []),
    ...(references ? [references] : []),
  ]);
}

function project(references: { path: string; kind: "folder" | "file" }[] = []) {
  const store = testStore(":memory:");
  const p = store.projects.create({ name: "a", description: "ノートアプリ", repo_path: "/tmp/a", provider: "claude" });
  return store.projects.update(p.id, { reference_paths: references });
}

test("ブラウザ: 開き先が Kickoff なら内蔵ツールを優先し、OS の既定なら外部で開くよう伝える", () => {
  const p = project();
  const kickoff = buildSystemPrompt(p, p.repo_path, { browser: "kickoff" });
  assert.match(kickoff, /既定の開き先は「Kickoff のブラウザ」/);
  assert.match(kickoff, /kickoff_browser の browser_tabs・browser_open などを優先/);
  assert.match(kickoff, /利用者が別のブラウザや自動テストを指定した場合を除き/);
  const external = buildSystemPrompt(p, p.repo_path, { browser: "browser" });
  assert.match(external, /既定の開き先は「既定のブラウザ」（OS の既定のブラウザ）/);
  assert.doesNotMatch(external, /browser_open などを優先/);
  // 内蔵ブラウザのない環境では、使えないツールを勧めない
  assert.doesNotMatch(buildSystemPrompt(p), /## ブラウザ/);
});

test("指示はセクション・タスク・成果物に触れず、プロジェクト・参照資料だけを伝える", () => {
  const prompt = buildSystemPrompt(project([{ path: "/tmp/spec", kind: "folder" }]));
  assert.ok(prompt.includes("日本語"));
  assert.ok(prompt.includes("- 名前: a"));
  assert.ok(prompt.includes("ノートアプリ"));
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

test("指示: 会話ごと別のフォルダへ移る EnterWorktree は使えず、書き換えを分けるなら Kickoff のワークツリーを利用者に提案する（サブエージェントのワークツリーは使える）", () => {
  const prompt = buildSystemPrompt(project([]));
  assert.match(prompt, /EnterWorktree \/ ExitWorktree）は使えません/);
  assert.match(prompt, /自分でチャットもワークツリーも作らずに/);
  assert.match(prompt, /［ワークツリーを作る］で作ったワークツリーのチャットで行うか、ワークツリーの子チャットを作るか/);
  assert.match(prompt, /isolation: "worktree" はこれまでどおり使えます/);
});

test("砂場: 砂場の行（guard が作る）は渡したときだけ、ゴミ箱の行のあとに入れる", () => {
  assert.doesNotMatch(buildSystemPrompt(project([])), /砂場/);
  const prompt = buildSystemPrompt(project([]), "/tmp/a", { trash: true, sandboxLines: ["- 砂場の行 1", "- 砂場の行 2"] });
  assert.ok(prompt.indexOf("- 砂場の行 1\n- 砂場の行 2") > prompt.indexOf("kickoff-trash"));
});
