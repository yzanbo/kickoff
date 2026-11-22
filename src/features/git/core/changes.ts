// 作業ツリーの変更（差分・ステージ・コミット・プッシュ・プル・フェッチ）
import type { GitDiff, GitOriginal } from "@shared/git/types";
import { git, nulList } from "@/foundation/core/workplace/git";
import { assertInside, MAX_FILE_BYTES } from "@/features/files/core/files";
import { gitPrefix, hasRef, listRemotes } from "@/foundation/core/workplace/reads";
import { gitStatus } from "./status";
import { Conflict, Invalid } from "@/foundation/core/errors";
import type { RemoteGit } from "@/foundation/core/workplace/kit";

/** ネットワークを使う操作（プッシュ・プル・フェッチ）の待ち時間 */
const NETWORK_TIMEOUT = 120_000;

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
  const base = ["diff", "--no-color", "--no-ext-diff", "--relative", "-M"];
  let diff = await git(repo).run(staged ? [...base, "--cached", ...paths] : [...base, ...paths]);
  if (!staged && !diff) {
    const untracked = await git(repo).run(["ls-files", "--others", "--exclude-standard", "--", file]);
    if (untracked.trim()) diff = await git(repo).run(["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", file], { okCodes: [1] });
  }
  return toGitDiff(diff);
}

/**
 * 差分の元の中身（変更タブで差分から編集するとき、左に並べる）。staged ならコミット（HEAD）の中身、そうでなければステージした中身
 * （索引。競合などで索引になければ HEAD）。どちらにもなければ空（追加・未追跡のファイル）。oldPath は名前を変えたときの元のパス。
 * パスは作業場所から見た形（./ を付けて、リポジトリの中のフォルダでもそのフォルダから見る）。改行などは作業中のファイルと同じ変換をする（--filters）
 */
export async function gitOriginal(repo: string, file: string, staged: boolean, oldPath?: string): Promise<GitOriginal> {
  await assertInside(repo, file);
  const source = oldPath ?? file;
  if (oldPath) await assertInside(repo, oldPath);
  const specs = staged ? [`HEAD:./${source}`] : [`:./${source}`, `HEAD:./${source}`];
  for (const spec of specs) {
    // ないもの（コミットがまだない・追加したファイル）は 128 で終わる
    const size = (await git(repo).run(["cat-file", "-s", spec], { okCodes: [128] })).trim();
    if (!size) continue;
    if (Number(size) > MAX_FILE_BYTES) return { content: "", binary: false, truncated: true };
    const content = await git(repo).run(["cat-file", "--filters", spec]);
    // 先頭に NUL があればバイナリとみなす（ファイルの中身と同じ考え方）
    const binary = content.slice(0, 8000).includes("\0");
    return { content: binary ? "" : content, binary, truncated: false };
  }
  return { content: "", binary: false, truncated: false };
}

/** git diff の出力を画面に返す形にする（バイナリの印と、大きすぎれば途中で切る） */
export function toGitDiff(diff: string): GitDiff {
  const binary = /^Binary files .* differ$/m.test(diff) || diff.includes("GIT binary patch");
  const truncated = diff.length > MAX_DIFF_CHARS;
  return { diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff, binary, truncated };
}

/** 操作するパスがすべてリポジトリの中か確かめる */
async function assertAllInside(repo: string, paths: string[]) {
  if (paths.length === 0) throw new Invalid("ファイルが選ばれていません");
  for (const p of paths) await assertInside(repo, p);
}

/** ステージする（消したファイルは、消したことをステージする） */
export async function stagePaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  await git(repo).run(["add", "-A", "--", ...paths]);
}

/** ステージを取り消す（作業中の中身はそのまま。コミットがまだないリポジトリでは索引から外す） */
export async function unstagePaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  const hasHead = await hasRef(repo, "HEAD");
  await git(repo).run(hasHead ? ["restore", "--staged", "--", ...paths] : ["rm", "-r", "-q", "--cached", "--", ...paths]);
}

/**
 * まだステージしていない変更を捨てる（元に戻す）。管理しているファイルはステージした中身に戻し、
 * 未追跡のファイルは消す。取り消せないので、画面で確かめてから呼ぶ
 */
export async function discardPaths(repo: string, paths: string[]): Promise<void> {
  await assertAllInside(repo, paths);
  const untracked = new Set(nulList(await git(repo).run(["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths])));
  const tracked = paths.filter((p) => !untracked.has(p));
  if (untracked.size > 0) await git(repo).run(["clean", "-f", "-q", "--", ...untracked]);
  if (tracked.length > 0) await git(repo).run(["restore", "--worktree", "--", ...tracked]);
}

/**
 * ステージした変更をコミットする（メッセージは必須。ステージしたものがなければ失敗する）。
 * amend は直前のコミットに足して書き直す（VS Code の「コミット (修正)」。ステージしたものがなくてもよく、メッセージが空なら前のメッセージのまま）。
 * プロジェクトのフォルダがリポジトリの中のフォルダで、その外にもステージしたファイルがあれば、一緒にコミットしないよう断る（409。外のファイルは画面に出ないため）
 */
export async function commitStaged(repo: string, message: string, amend = false): Promise<void> {
  if (!amend && !message.trim()) throw new Invalid("コミットのメッセージを入れてください");
  if (await gitPrefix(repo)) {
    const all = nulList(await git(repo).run(["diff", "--cached", "--name-only", "-z"]));
    const inside = new Set(nulList(await git(repo).run(["diff", "--cached", "--name-only", "-z", "--", "."])));
    const outside = all.filter((f) => !inside.has(f));
    if (outside.length > 0) {
      const shown = outside.slice(0, 3).join("、") + (outside.length > 3 ? ` ほか ${outside.length - 3} 件` : "");
      throw new Conflict(`プロジェクトフォルダの外にも、ステージしたファイルがあります（${shown}）。一緒にコミットしないよう、ターミナルで git restore --staged で外してからコミットしてください`);
    }
  }
  if (amend) await git(repo).run(["commit", "-q", "--amend", ...(message.trim() ? ["-m", message] : ["--no-edit"])]);
  else await git(repo).run(["commit", "-q", "-m", message]);
}

/**
 * いまのブランチをプッシュする。追いかけているリモートのブランチがなければ、origin に同じ名前で公開する
 * （VS Code の「ブランチの発行」と同じ）。認証は利用者の git の設定（SSH・キーチェーン）に任せる
 */
export async function pushBranch(repo: string, remoteGit: RemoteGit): Promise<void> {
  const status = await gitStatus(repo);
  if (!status.repo || !status.branch) throw new Invalid("プッシュするブランチがありません");
  if (status.upstream) {
    await remoteGit(repo, { timeout: NETWORK_TIMEOUT }).run(["push", "-q"]);
    return;
  }
  if (!status.has_origin) throw new Invalid("プッシュ先のリモート（origin）がありません");
  await remoteGit(repo, { timeout: NETWORK_TIMEOUT }).run(["push", "-q", "-u", "origin", status.branch]);
}

/** リモートの変更を取ってきて、いまのブランチを早送りで最新にする（手元の変更とぶつかるときは失敗する） */
export async function pullBranch(repo: string, remoteGit: RemoteGit): Promise<void> {
  await remoteGit(repo, { timeout: NETWORK_TIMEOUT }).run(["pull", "--ff-only", "-q"]);
}

/** リモートの情報を取ってくる（作業中のファイルは変えない。遅れている数を出すのに使う。origin がなければ何もしない） */
export async function fetchRemote(repo: string, remoteGit: RemoteGit): Promise<void> {
  if ((await listRemotes(repo)).length === 0) return;
  await remoteGit(repo, { timeout: NETWORK_TIMEOUT }).run(["fetch", "-q", "--prune"]);
}
