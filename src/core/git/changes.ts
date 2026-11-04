// 作業ツリーの変更（差分・ステージ・コミット・プッシュ・プル・フェッチ）
import type { GitDiff } from "@shared/types";
import { gitOutput, nulList } from "./exec.js";
import { assertInside } from "./files.js";
import { gitStatus, hasRef, listRemotes } from "./status.js";

/** 差分を返す上限（これより大きければ途中で切る） */
const MAX_DIFF_CHARS = 400_000;

/**
 * 1 つのファイルの差分。staged ならステージされている分、そうでなければまだステージしていない分。
 * 未追跡のファイルは、空のファイルとの差分（すべて追加）にする。oldPath は名前を変えたときの元のパス
 */
export async function gitDiff(repo: string, file: string, staged: boolean, oldPath?: string): Promise<GitDiff> {
  await assertInside(repo, file);
  if (oldPath) await assertInside(repo, oldPath);
  const paths = oldPath ? ["--", oldPath, file] : ["--", file];
  const base = ["diff", "--no-color", "--no-ext-diff", "-M"];
  let diff = await gitOutput(repo, staged ? [...base, "--cached", ...paths] : [...base, ...paths]);
  if (!staged && !diff) {
    const untracked = await gitOutput(repo, ["ls-files", "--others", "--exclude-standard", "--", file]);
    if (untracked.trim()) diff = await gitOutput(repo, ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", file], [1]);
  }
  return toGitDiff(diff);
}

/** git diff の出力を画面に返す形にする（バイナリの印と、大きすぎれば途中で切る） */
export function toGitDiff(diff: string): GitDiff {
  const binary = /^Binary files .* differ$/m.test(diff) || diff.includes("GIT binary patch");
  const truncated = diff.length > MAX_DIFF_CHARS;
  return { diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff, binary, truncated };
}

/** 操作するパスがすべてリポジトリの中か確かめる */
async function assertAllInside(repo: string, paths: string[]) {
  if (paths.length === 0) throw new Error("ファイルが選ばれていません");
  for (const p of paths) await assertInside(repo, p);
}

/** ステージする（消したファイルは、消したことをステージする） */
export async function stagePaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  await gitOutput(repo, ["add", "-A", "--", ...paths]);
}

/** ステージを取り消す（作業中の中身はそのまま。コミットがまだないリポジトリでは索引から外す） */
export async function unstagePaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  const hasHead = await hasRef(repo, "HEAD");
  await gitOutput(repo, hasHead ? ["restore", "--staged", "--", ...paths] : ["rm", "-r", "-q", "--cached", "--", ...paths]);
}

/**
 * まだステージしていない変更を捨てる（元に戻す）。管理しているファイルはステージした中身に戻し、
 * 未追跡のファイルは消す。取り消せないので、画面で確かめてから呼ぶ
 */
export async function discardPaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  const untracked = new Set(nulList(await gitOutput(repo, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths])));
  const tracked = paths.filter((p) => !untracked.has(p));
  if (untracked.size > 0) await gitOutput(repo, ["clean", "-f", "-q", "--", ...untracked]);
  if (tracked.length > 0) await gitOutput(repo, ["restore", "--worktree", "--", ...tracked]);
}

/** ステージした変更をコミットする（メッセージは必須。ステージしたものがなければ失敗する） */
export async function commitStaged(repo: string, message: string): Promise<void> {
  if (!message.trim()) throw new Error("コミットのメッセージを入れてください");
  await gitOutput(repo, ["commit", "-q", "-m", message]);
}

/**
 * いまのブランチをプッシュする。追いかけているリモートのブランチがなければ、origin に同じ名前で公開する
 * （VS Code の「ブランチの発行」と同じ）。認証は利用者の git の設定（SSH・キーチェーン）に任せる
 */
export async function pushBranch(repo: string): Promise<void> {
  const status = await gitStatus(repo);
  if (!status.repo || !status.branch) throw new Error("プッシュするブランチがありません");
  if (status.upstream) {
    await gitOutput(repo, ["push", "-q"], [], 120_000);
    return;
  }
  if (!status.has_origin) throw new Error("プッシュ先のリモート（origin）がありません");
  await gitOutput(repo, ["push", "-q", "-u", "origin", status.branch], [], 120_000);
}

/** リモートの変更を取ってきて、いまのブランチを早送りで最新にする（手元の変更とぶつかるときは失敗する） */
export async function pullBranch(repo: string): Promise<void> {
  await gitOutput(repo, ["pull", "--ff-only", "-q"], [], 120_000);
}

/** リモートの情報を取ってくる（作業中のファイルは変えない。遅れている数を出すのに使う。origin がなければ何もしない） */
export async function fetchRemote(repo: string): Promise<void> {
  if ((await listRemotes(repo)).length === 0) return;
  await gitOutput(repo, ["fetch", "-q", "--prune"], [], 120_000);
}
