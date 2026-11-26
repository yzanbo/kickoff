import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { Workplace } from "@/foundation/core/workplace/worktrees";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { writeTargetOf } from "./scope";
import { judgeFileWrite, type WriteScopeFacts } from "./writeScope";

/** 本体・ワークツリー・サブエージェントのワークツリー・ノート・Claude Code の設定を並べた一時フォルダ（実体のパス） */
function layout() {
  const root = tempDir({ real: true });
  const main = path.join(root, "app");
  const wt = path.join(root, "app-worktrees", "feat-x");
  const sub = path.join(main, ".claude", "worktrees", "agent-1");
  const note = path.join(root, "notes");
  const claude = path.join(root, "claude");
  const other = path.join(root, "other-project");
  for (const dir of [main, wt, sub, note, claude, other]) fs.mkdirSync(dir, { recursive: true });
  const workplaces: Workplace[] = [
    { path: main, worktree_path: null, branch: "main" },
    { path: wt, worktree_path: wt, branch: "feat/x" },
    { path: sub, worktree_path: sub, branch: "worktree-agent-1" },
  ];
  const facts = (workdir: string, over: Partial<WriteScopeFacts> = {}): WriteScopeFacts => ({
    workdir,
    writableDirs: [note],
    exceptionDirs: [path.join(claude, "plans")],
    memoryParents: [path.join(claude, "projects")],
    workplaces: async () => workplaces,
    ...over,
  });
  return { root, main, wt, sub, note, claude, other, facts };
}

test("書き込み先の守り: 自分の作業場所・ノートのフォルダ・Claude Code のメモリと計画・サブエージェントのワークツリーは書ける", async () => {
  const { main, wt, sub, note, claude, facts } = layout();
  const kind = async (workdir: string, target: string) => (await judgeFileWrite(target, facts(workdir))).kind;
  assert.equal(await kind(main, path.join(main, "src/a.ts")), "pass");
  assert.equal(await kind(wt, path.join(wt, "src/a.ts")), "pass");
  assert.equal(await kind(main, path.join(note, "開発履歴/a.md")), "pass");
  assert.equal(await kind(wt, path.join(note, "a.html")), "pass");
  assert.equal(await kind(main, path.join(claude, "projects", "-Users-x-app", "memory", "a.md")), "pass");
  assert.equal(await kind(main, path.join(claude, "plans", "plan.md")), "pass");
  // サブエージェントのワークツリーは、本体のチャットからもワークツリーのチャットからも書ける（本体の中に置かれる）
  assert.equal(await kind(main, path.join(sub, "src/a.ts")), "pass");
  assert.equal(await kind(wt, path.join(sub, "src/a.ts")), "pass");
});

test("書き込み先の守り: 同じリポジトリのほかの作業場所は断り、利用者にチャットを提案するよう案内する", async () => {
  const { main, wt, facts } = layout();
  const fromMain = await judgeFileWrite(path.join(wt, "src/a.ts"), facts(main));
  assert.equal(fromMain.kind, "deny");
  assert.match(fromMain.kind === "deny" ? fromMain.reason : "", /WT \| feat\/x/);
  assert.match(fromMain.kind === "deny" ? fromMain.reason : "", /自分でチャットを作らずに、利用者に「そのワークツリー（feat\/x）のチャットで行うか、そのワークツリー（feat\/x）で子チャットを作るか」/);
  const fromWt = await judgeFileWrite(path.join(main, "package.json"), facts(wt));
  assert.equal(fromWt.kind, "deny");
  assert.match(fromWt.kind === "deny" ? fromWt.reason : "", /本体のチャットで行うか、本体で子チャットを作るか/);
  // 本体の .git もファイルのツールでは書けない（ワークツリーのコミットが書くのは Bash。Bash の砂場の例外）
  assert.equal((await judgeFileWrite(path.join(main, ".git", "config"), facts(wt))).kind, "deny");
});

test("書き込み先の守り: それ以外の外（ホームの設定・ほかのプロジェクト・Claude Code の設定）は聞く", async () => {
  const { main, claude, other, facts } = layout();
  const ask = await judgeFileWrite(path.join(other, "README.md"), facts(main));
  assert.equal(ask.kind, "ask");
  assert.match(ask.kind === "ask" ? ask.title : "", /作業場所の外のファイルに書き込もうとしています/);
  assert.equal((await judgeFileWrite(path.join(claude, "settings.json"), facts(main))).kind, "ask");
  // メモリのフォルダの外（projects の直下・memory でない段）は例外にしない
  assert.equal((await judgeFileWrite(path.join(claude, "projects", "-Users-x-app", "abc.jsonl"), facts(main))).kind, "ask");
  assert.equal((await judgeFileWrite(path.join(claude, "projects", "memory"), facts(main))).kind, "ask");
});

test("書き込み先の守り: 作業場所の一覧が取れなければ、作業場所の中かだけで見る", async () => {
  const { main, wt, other, facts } = layout();
  const f = facts(main, { workplaces: async () => [] });
  assert.equal((await judgeFileWrite(path.join(main, "a.ts"), f)).kind, "pass");
  assert.equal((await judgeFileWrite(path.join(wt, "a.ts"), f)).kind, "ask");
  assert.equal((await judgeFileWrite(path.join(other, "a.ts"), f)).kind, "ask");
});

test("書き込み先の守り: リンクを通した書き込みは、リンクの先の作業場所で判定する", async () => {
  const { main, wt, facts } = layout();
  fs.symlinkSync(wt, path.join(main, "wt-link"));
  const target = writeTargetOf(main, "Write", { file_path: "wt-link/new/file.ts" });
  assert.equal(target, path.join(wt, "new/file.ts"));
  assert.equal((await judgeFileWrite(target!, facts(main))).kind, "deny");
  // ファイルを書き換えないツールは見ない
  assert.equal(writeTargetOf(main, "Read", { file_path: "a.ts" }), null);
  assert.equal(writeTargetOf(main, "NotebookEdit", { notebook_path: "n.ipynb" }), path.join(main, "n.ipynb"));
});

test("書き込み先の守り: 断るフォルダ（共通のチャットから見た利用者のプロジェクト）は聞かずに断る。作業フォルダ・書けるフォルダが中にあっても、そこは書ける", async () => {
  const { root, note, other, facts } = layout();
  // 共通の作業フォルダ（Git でない）と、作業フォルダ・ノートを中に持つ大きなプロジェクト
  const work = path.join(root, ".common-work");
  fs.mkdirSync(work, { recursive: true });
  const denied = { dirs: [other, root], reason: "共通のチャットからは書けません" };
  const f = facts(work, { workplaces: async () => [], denied });
  const verdict = await judgeFileWrite(path.join(other, "src/a.ts"), f);
  assert.ok(verdict.kind === "deny" && verdict.reason.includes("共通のチャットからは書けません"));
  assert.equal((await judgeFileWrite(path.join(work, "a.txt"), f)).kind, "pass");
  assert.equal((await judgeFileWrite(path.join(note, "a.md"), f)).kind, "pass");
  // 断るフォルダの外は、これまでどおり聞く
  assert.equal((await judgeFileWrite("/opt/elsewhere/a.txt", facts(work, { workplaces: async () => [], denied: { dirs: [other], reason: "x" } }))).kind, "ask");
});

test("書き込み先の守り: 共通のチャットは一時フォルダ（決まりの例外）の中の利用者のプロジェクトも断る。作業フォルダ・共通のノートは断るフォルダの中でも書ける", async () => {
  const { root, facts } = layout();
  // 一時フォルダに見立てたフォルダの中に、利用者のプロジェクト・共通の作業フォルダ・共通のノートを置く（見本データの /private/tmp/kickoff-fixture と同じ形）
  const tmp = path.join(root, "tmp");
  const alpha = path.join(tmp, "repos", "alpha");
  const work = path.join(tmp, ".common-work");
  const common = path.join(tmp, "_common");
  for (const dir of [alpha, work, common]) fs.mkdirSync(dir, { recursive: true });
  const denied = { dirs: [alpha, tmp], reason: "共通のチャットからは書けません" };
  const f = facts(work, { writableDirs: [common], exceptionDirs: [tmp], workplaces: async () => [], denied });
  const verdict = await judgeFileWrite(path.join(alpha, "src/a.ts"), f);
  assert.ok(verdict.kind === "deny" && verdict.reason.includes("共通のチャットからは書けません"));
  assert.equal((await judgeFileWrite(path.join(work, "a.txt"), f)).kind, "pass");
  assert.equal((await judgeFileWrite(path.join(common, "a.md"), f)).kind, "pass");
  // 断るフォルダの外の一時フォルダは、これまでどおり聞かずに書ける
  const onlyAlpha = facts(work, { writableDirs: [common], exceptionDirs: [tmp], workplaces: async () => [], denied: { dirs: [alpha], reason: "x" } });
  assert.equal((await judgeFileWrite(path.join(tmp, "scratch.txt"), onlyAlpha)).kind, "pass");
});

test("書き込み先の守り: プロジェクトのチャット（断るフォルダなし）は、一時フォルダの中なら同じリポジトリのほかの作業場所でもこれまでどおり書ける", async () => {
  const { main, wt, facts } = layout();
  // 本体ごと一時フォルダに見立てる（決まりの例外は作業場所の判定より先に通す）
  const f = facts(wt, { exceptionDirs: [path.dirname(main)] });
  assert.equal((await judgeFileWrite(path.join(main, "a.ts"), f)).kind, "pass");
  assert.equal((await judgeFileWrite(path.join(main, "a.ts"), facts(wt))).kind, "deny");
});
