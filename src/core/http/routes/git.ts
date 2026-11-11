import type { Context, Hono } from "hono";
import { z } from "zod";
import { commitStaged, discardPaths, fetchRemote, gitBlame, gitCommitDetail, gitCommitDiff, gitDiff, gitLog, gitOriginal, gitRefs, gitStatus, pullBranch, pushBranch, stagePaths, unstagePaths } from "../../git/index.js";
import { mergePreview, resolveConflict, runBranchAction, runOperationAction } from "../../git/branches.js";
import { createPullRequest, pullRequestFor } from "../../git/github.js";
import { resolveGitHubTarget } from "../../git/githubTarget.js";
import type { GitBranchAction, GitBranchActionResult } from "@shared/types";
import type { ServerDeps } from "../server.js";
import { Invalid } from "../errors.js";
import { jsonBody, queryOf } from "../input.js";
import { lookups } from "../lookups.js";
import { branchName, flag, repoPath } from "./schemas.js";

const diffQuerySchema = z.object({ path: repoPath, old: repoPath.optional(), staged: flag.default("0") });

/** Git の操作をしてから、新しい状態を返す（操作の失敗は 400） */
async function gitAction(c: Context, dir: string, action: () => Promise<void>) {
  await action();
  return c.json(await gitStatus(dir));
}

/** ブランチ・タグの名前（手元・リモート・タグ・コミットの番号）。「-」で始まる名前はコアが断る */
const refName = z.string().trim().min(1).max(255);
/** 退避の名前（"stash@{0}" の形だけ） */
const stashRef = z.string().regex(/^stash@\{\d+\}$/);

/** ブランチ・タグの操作の本文（履歴の左の一覧・コミットの札の右クリック） */
const branchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), branch: refName }),
  z.object({ action: z.literal("checkout_remote"), remote_branch: refName, name: branchName }),
  z.object({ action: z.literal("checkout_detached"), ref: refName }),
  z.object({ action: z.literal("fast_forward"), branch: refName }),
  z.object({ action: z.literal("pull"), branch: refName }),
  z.object({ action: z.literal("push"), branch: refName }),
  z.object({ action: z.literal("push_pr"), branch: refName }),
  z.object({ action: z.literal("merge"), branch: refName }),
  z.object({ action: z.literal("rebase"), branch: refName }),
  z.object({ action: z.literal("create_branch"), name: branchName, from: refName, checkout: z.boolean() }),
  z.object({ action: z.literal("create_tag"), name: refName, at: refName, message: z.string().max(10_000).nullable(), push: z.boolean() }),
  z.object({ action: z.literal("set_upstream"), branch: refName, upstream: refName.nullable() }),
  z.object({ action: z.literal("rename_branch"), branch: refName, name: branchName }),
  z.object({ action: z.literal("delete_branch"), branch: refName, force: z.boolean(), remote: z.boolean() }),
  z.object({ action: z.literal("delete_remote_branch"), remote_branch: refName }),
  z.object({ action: z.literal("push_tag"), name: refName }),
  z.object({ action: z.literal("delete_tag"), name: refName, remote: z.boolean() }),
  z.object({ action: z.literal("stash_save"), message: z.string().max(10_000).nullable(), include_untracked: z.boolean() }),
  z.object({ action: z.literal("stash_pop"), ref: stashRef }),
  z.object({ action: z.literal("stash_apply"), ref: stashRef }),
  z.object({ action: z.literal("stash_drop"), ref: stashRef }),
]) satisfies z.ZodType<GitBranchAction>;

/**
 * 作業場所の Git（ソース管理の状態・差分・ステージ・コミット・プッシュ・プル・履歴・PR）。操作するフォルダは withWorkdir（?worktree=）の c.var.workdir。
 * ファイルの一覧・中身は http/routes/files.ts、ワークツリーは http/routes/worktrees.ts
 */
export function gitRoutes(app: Hono, { store }: ServerDeps) {
  const { withWorkdir } = lookups(store);

  app.get("/api/projects/:id/git/status", withWorkdir, async (c) => c.json(await gitStatus(c.var.workdir)));

  app.get("/api/projects/:id/git/diff", withWorkdir, async (c) => {
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    return c.json(await gitDiff(c.var.workdir, query.path, query.staged === "1", query.old));
  });

  // 差分の元の中身（差分から編集するとき、左に並べる。staged なら HEAD、そうでなければ索引）
  app.get("/api/projects/:id/git/original", withWorkdir, async (c) => {
    const query = diffQuerySchema.parse({ path: c.req.query("path"), old: c.req.query("old"), staged: c.req.query("staged") });
    return c.json(await gitOriginal(c.var.workdir, query.path, query.staged === "1", query.old));
  });

  // 行ごとの変更の記録（git blame。エディタのいまの行の右に、いつ誰が変えたかを出す。Git で管理していないファイルは null）
  app.get("/api/projects/:id/git/blame", withWorkdir, async (c) => {
    const { path } = z.object({ path: repoPath }).parse({ path: c.req.query("path") });
    return c.json(await gitBlame(c.var.workdir, path));
  });

  // ステージ・ステージの取り消し・変更を捨てる（元に戻す）。終わったら新しい状態を返す
  const pathsSchema = z.object({ paths: z.array(repoPath).min(1).max(5000) });
  const actions = { stage: stagePaths, unstage: unstagePaths, discard: discardPaths } as const;
  for (const [name, action] of Object.entries(actions)) {
    app.post(`/api/projects/:id/git/${name}`, withWorkdir, async (c) => {
      const { paths } = pathsSchema.parse(await jsonBody(c));
      const dir = c.var.workdir;
      return gitAction(c, dir, () => action(dir, paths));
    });
  }

  // コミット・プッシュ（終わったら新しい状態を返す）
  app.post("/api/projects/:id/git/commit", withWorkdir, async (c) => {
    const { message, amend } = z.object({ message: z.string().max(10_000), amend: z.boolean().optional() }).parse(await jsonBody(c));
    const dir = c.var.workdir;
    return gitAction(c, dir, () => commitStaged(dir, message, amend));
  });

  app.post("/api/projects/:id/git/push", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => pushBranch(c.var.workdir)));

  // 履歴（読むだけ）
  app.get("/api/projects/:id/git/refs", withWorkdir, async (c) => c.json(await gitRefs(c.var.workdir)));

  app.get("/api/projects/:id/git/log", withWorkdir, async (c) => {
    const { skip, limit } = z
      .object({ skip: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(200) })
      .parse({ skip: queryOf(c, "skip"), limit: queryOf(c, "limit") });
    return c.json(await gitLog(c.var.workdir, skip, limit));
  });

  app.get("/api/projects/:id/git/commits/:hash", withWorkdir, async (c) => c.json(await gitCommitDetail(c.var.workdir, c.req.param("hash"))));

  app.get("/api/projects/:id/git/commits/:hash/diff", withWorkdir, async (c) => {
    const query = z.object({ path: repoPath, old: repoPath.optional() }).parse({ path: c.req.query("path"), old: c.req.query("old") });
    return c.json(await gitCommitDiff(c.var.workdir, c.req.param("hash"), query.path, query.old));
  });

  // フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない）
  app.post("/api/projects/:id/git/fetch", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => fetchRemote(c.var.workdir)));

  // プル（早送りで最新にする）
  app.post("/api/projects/:id/git/pull", withWorkdir, async (c) => gitAction(c, c.var.workdir, () => pullBranch(c.var.workdir)));

  // ブランチ・タグの操作（チェックアウト・プッシュ・マージなど）。終わったら状態と、衝突して止まったら衝突したファイルを返す
  app.post("/api/projects/:id/git/branch-action", withWorkdir, async (c) => {
    const body = branchActionSchema.parse(await jsonBody(c));
    const dir = c.var.workdir;
    const { conflicts } = await runBranchAction(dir, body);
    const result: GitBranchActionResult = { status: await gitStatus(dir), conflicts };
    // プッシュして PR を作る（gh で、タイトルと本文はコミットから）
    if (body.action === "push_pr") result.pr = await createPullRequest(dir, body.branch, await resolveGitHubTarget(dir, c.var.project.github_remote));
    return c.json(result);
  });

  // マージ・リベースの前の見込み（取り込むものがあるか・早送りで済むか・衝突しそうなファイル）
  app.get("/api/projects/:id/git/merge-preview", withWorkdir, async (c) => {
    const branch = refName.parse(c.req.query("branch"));
    return c.json(await mergePreview(c.var.workdir, branch));
  });

  // 途中で止まっているマージ・リベースなどを、取りやめる・続ける・飛ばす
  app.post("/api/projects/:id/git/operation", withWorkdir, async (c) => {
    const { action } = z.object({ action: z.enum(["abort", "continue", "skip"]) }).parse(await jsonBody(c));
    const dir = c.var.workdir;
    const { conflicts } = await runOperationAction(dir, action);
    return c.json({ status: await gitStatus(dir), conflicts } satisfies GitBranchActionResult);
  });

  // 衝突したファイルを解く（こちらの版・取り込む側の版を使う・いまの中身で解決済みにする）
  app.post("/api/projects/:id/git/resolve", withWorkdir, async (c) => {
    const { path, how } = z.object({ path: repoPath, how: z.enum(["ours", "theirs", "mark"]) }).parse(await jsonBody(c));
    const dir = c.var.workdir;
    return gitAction(c, dir, () => resolveConflict(dir, path, how));
  });

  // 作業場所のブランチの PR（GitHub。gh を使う）。なければ null
  app.get("/api/projects/:id/git/pr", withWorkdir, async (c) => {
    const dir = c.var.workdir;
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch || !status.has_origin) return c.json(null);
    return c.json(await pullRequestFor(dir, status.branch, await resolveGitHubTarget(dir, c.var.project.github_remote)));
  });

  // PR を作る（まだプッシュしていなければ、先にプッシュする）
  app.post("/api/projects/:id/git/pr", withWorkdir, async (c) => {
    const dir = c.var.workdir;
    const status = await gitStatus(dir);
    if (!status.repo || !status.branch) throw new Invalid("PR にするブランチがありません");
    if (!status.upstream || status.ahead > 0) await pushBranch(dir);
    return c.json(await createPullRequest(dir, status.branch, await resolveGitHubTarget(dir, c.var.project.github_remote)), 201);
  });
}
