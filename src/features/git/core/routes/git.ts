import { z } from "zod";
import type { GitApi } from "@/features/git/core/index";
import { gitBlame } from "@/features/git/core/blame";
import { mergePreview, pushBranch, resolveConflict, runBranchAction, runOperationAction } from "@/features/git/core/branches";
import { commitStaged, discardPaths, fetchRemote, gitDiff, gitOriginal, pullBranch, stagePaths, unstagePaths } from "@/features/git/core/changes";
import { gitCommitDetail, gitCommitDiff, gitLog, gitRefs } from "@/features/git/core/history";
import { gitStatus } from "@/features/git/core/status";
import { gitContract } from "@shared/git/contract";
import type { Project } from "@shared/projects/types";
import type { RemoteGit } from "@/foundation/core/workplace/kit";
import { implement, type Param } from "@/foundation/core/http/implement";
import { branchName, flagOn, repoPath, workdirQuery } from "@/foundation/core/http/zodParts";

const diffQuerySchema = workdirQuery.extend({ path: repoPath, old: repoPath.optional(), staged: flagOn("0") });

/** Git の操作をしてから、新しい状態を返す（操作の失敗は 400） */
async function gitAction(dir: string, action: () => Promise<void>) {
  await action();
  return gitStatus(dir);
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
]);

/** ステージ・ステージの取り消し・変更を捨てるの本文 */
const pathsBody = z.object({ paths: z.array(repoPath).min(1).max(5000) });
/** パスの :hash はそのまま渡す（git が知らない名前なら 400） */
const hashParam: Param<string> = { parse: (raw) => raw };

/**
 * 作業場所の Git（ソース管理の状態・差分・ステージ・コミット・プッシュ・プル・履歴・ブランチの操作）。操作するフォルダは取り決めの workdir: true が ?worktree= から解く。
 * ファイルの一覧・中身は files の routes/files.ts、ワークツリーは worktrees の routes/worktrees.ts
 */
export function gitRoutes({ remoteGit, projectParam, withRepoLock, autoFetch }: {
  remoteGit: RemoteGit;
  projectParam: Param<Project>;
  withRepoLock: GitApi["withRepoLock"];
  autoFetch(dir: string, run: () => Promise<void>): Promise<void>;
}) {
  /** 変更する操作（リポジトリの鍵の中で。自動のフェッチの途中なら終わるのを待ち、終わったら新しい状態を返す） */
  const userAction = (dir: string, action: () => Promise<void>) => withRepoLock(dir, "user", () => gitAction(dir, action));
  return implement(gitContract, {
    context: { projectId: projectParam, hash: hashParam },
    "GET /api/projects/:projectId/git/status": { query: workdirQuery, run: ({ workdir }) => gitStatus(workdir) },
    "GET /api/projects/:projectId/git/diff": { query: diffQuerySchema, run: ({ workdir, query }) => gitDiff(workdir, query.path, query.staged, query.old) },
    // 差分の元の中身（差分から編集するとき、左に並べる。staged なら HEAD、そうでなければ索引）
    "GET /api/projects/:projectId/git/original": { query: diffQuerySchema, run: ({ workdir, query }) => gitOriginal(workdir, query.path, query.staged, query.old) },
    // 行ごとの変更の記録（git blame。エディタのいまの行の右に、いつ誰が変えたかを出す。Git で管理していないファイルは null）
    "GET /api/projects/:projectId/git/blame": { query: workdirQuery.extend({ path: repoPath }), run: ({ workdir, query }) => gitBlame(workdir, query.path) },
    // ステージ・ステージの取り消し・変更を捨てる（元に戻す）・コミット・プッシュ。終わったら新しい状態を返す
    "POST /api/projects/:projectId/git/stage": { query: workdirQuery, body: pathsBody, run: ({ workdir, body }) => userAction(workdir, () => stagePaths(workdir, body.paths)) },
    "POST /api/projects/:projectId/git/unstage": { query: workdirQuery, body: pathsBody, run: ({ workdir, body }) => userAction(workdir, () => unstagePaths(workdir, body.paths)) },
    "POST /api/projects/:projectId/git/discard": { query: workdirQuery, body: pathsBody, run: ({ workdir, body }) => userAction(workdir, () => discardPaths(workdir, body.paths)) },
    "POST /api/projects/:projectId/git/commit": {
      query: workdirQuery,
      body: z.object({ message: z.string().max(10_000), amend: z.boolean().optional() }),
      run: ({ workdir, body }) => userAction(workdir, () => commitStaged(workdir, body.message, body.amend)),
    },
    "POST /api/projects/:projectId/git/push": { query: workdirQuery, run: ({ workdir }) => userAction(workdir, () => pushBranch(workdir, remoteGit)) },
    // 履歴（読むだけ）
    "GET /api/projects/:projectId/git/refs": { query: workdirQuery, run: ({ workdir }) => gitRefs(workdir) },
    "GET /api/projects/:projectId/git/log": { query: workdirQuery.extend({ skip: z.coerce.number().int().min(0).default(0) }), run: ({ workdir, query }) => gitLog(workdir, query.skip) },
    "GET /api/projects/:projectId/git/commits/:hash": { query: workdirQuery, run: ({ workdir, hash }) => gitCommitDetail(workdir, hash) },
    "GET /api/projects/:projectId/git/commits/:hash/diff": {
      query: workdirQuery.extend({ path: repoPath, old: repoPath.optional() }),
      run: ({ workdir, hash, query }) => gitCommitDiff(workdir, hash, query.path, query.old),
    },
    // フェッチ（リモートの情報を取ってくる。作業中のファイルは変えない。auto は画面が裏で頼む自動のフェッチで、飛ばすかはコアが決め、失敗は知らせない）・プル（早送りで最新にする）
    "POST /api/projects/:projectId/git/fetch": {
      query: workdirQuery,
      body: z.object({ auto: z.boolean().optional() }),
      run: async ({ workdir, body }) => {
        if (!body.auto) return userAction(workdir, () => fetchRemote(workdir, remoteGit));
        await autoFetch(workdir, () => fetchRemote(workdir, remoteGit));
        return gitStatus(workdir);
      },
    },
    "POST /api/projects/:projectId/git/pull": { query: workdirQuery, run: ({ workdir }) => userAction(workdir, () => pullBranch(workdir, remoteGit)) },
    // ブランチ・タグの操作（チェックアウト・プッシュ・マージなど）。終わったら状態と、衝突して止まったら衝突したファイルを返す
    "POST /api/projects/:projectId/git/branch-action": {
      query: workdirQuery,
      body: branchActionSchema,
      run: ({ workdir: dir, body }) => withRepoLock(dir, "user", async () => {
        const { conflicts } = await runBranchAction(dir, body, remoteGit);
        return { status: await gitStatus(dir), conflicts };
      }),
    },
    // マージ・リベースの前の見込み（取り込むものがあるか・早送りで済むか・衝突しそうなファイル）
    "GET /api/projects/:projectId/git/merge-preview": { query: workdirQuery.extend({ branch: refName }), run: ({ workdir, query }) => mergePreview(workdir, query.branch) },
    // 途中で止まっているマージ・リベースなどを、取りやめる・続ける・飛ばす
    "POST /api/projects/:projectId/git/operation": {
      query: workdirQuery,
      body: z.object({ action: z.enum(["abort", "continue", "skip"]) }),
      run: ({ workdir: dir, body }) => withRepoLock(dir, "user", async () => {
        const { conflicts } = await runOperationAction(dir, body.action);
        return { status: await gitStatus(dir), conflicts };
      }),
    },
    // 衝突したファイルを解く（こちらの版・取り込む側の版を使う・いまの中身で解決済みにする）
    "POST /api/projects/:projectId/git/resolve": {
      query: workdirQuery,
      body: z.object({ path: repoPath, how: z.enum(["ours", "theirs", "mark"]) }),
      run: ({ workdir: dir, body }) => userAction(dir, () => resolveConflict(dir, body.path, body.how)),
    },
  });
}
