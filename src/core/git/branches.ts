// ブランチ・タグの操作（履歴の左の一覧・コミットの札の右クリック）と、途中で止まったマージ・リベースの扱い
import type { GitBranchAction, GitConflictResolution, GitMergePreview, GitOperationAction } from "@shared/types";
import { Invalid } from "../http/errors.js";
import { gitOutput } from "./exec.js";
import { gitOperation, gitStatus, hasRef } from "./status.js";

/** ネットワークを使う操作（プッシュ・プル・フェッチ）の待ち時間 */
const NETWORK_TIMEOUT = 120_000;

/**
 * 衝突で止まることのある操作（マージ・リベース・プル・続ける）を、エディタを開かずに動かす（コミットのメッセージは git が用意したもの）。
 * 失敗しても衝突したファイルがあれば、止まったとしてそのファイルを返す（衝突でない失敗は、git の説明のまま投げる）
 */
async function runStoppable(repo: string, args: string[]): Promise<{ conflicts: string[] }> {
  try {
    await gitOutput(repo, args, [], NETWORK_TIMEOUT, { GIT_EDITOR: "true" });
  } catch (e) {
    const conflicts = await conflictedFiles(repo);
    if (conflicts.length === 0) throw e;
    return { conflicts };
  }
  return { conflicts: await conflictedFiles(repo) };
}

/** オプションと取り違える名前（「-」で始まる）を断る */
function assertRefName(name: string): string {
  if (!name || name.startsWith("-")) throw new Invalid(`名前に使えません: ${name}`);
  return name;
}

/** 新しいブランチ名として使えるか（git の決まり。使えなければ理由を投げる） */
async function assertNewBranchName(repo: string, name: string): Promise<void> {
  assertRefName(name);
  try {
    await gitOutput(repo, ["check-ref-format", "--branch", name]);
  } catch {
    throw new Invalid(`ブランチ名に使えない文字が入っています: ${name}`);
  }
  if (await hasRef(repo, `refs/heads/${name}`)) throw new Invalid(`同じ名前のブランチがあります: ${name}`);
}

/** ブランチの追いかけているリモートのブランチ（"origin/main" の形。なければ null） */
async function upstreamOf(repo: string, branch: string): Promise<string | null> {
  try {
    return (await gitOutput(repo, ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`])).trim() || null;
  } catch {
    return null;
  }
}

/** "origin/feature/x" をリモートと、その中のブランチ名に分ける（リモートの一覧から長いものを先に当てる） */
async function splitRemoteBranch(repo: string, remoteBranch: string): Promise<{ remote: string; branch: string }> {
  const remotes = (await gitOutput(repo, ["remote"])).split("\n").filter(Boolean);
  const remote = remotes.sort((a, b) => b.length - a.length).find((r) => remoteBranch.startsWith(`${r}/`));
  if (!remote) throw new Invalid(`リモートのブランチではありません: ${remoteBranch}`);
  return { remote, branch: remoteBranch.slice(remote.length + 1) };
}

/** いまのブランチ（ブランチから外れていれば null） */
async function headBranch(repo: string): Promise<string | null> {
  const status = await gitStatus(repo);
  return status.repo ? status.branch : null;
}

/** 衝突しているファイル（リポジトリの一番上から見たパス。プロジェクトがリポジトリの中のフォルダでも、外の衝突も数える） */
async function conflictedFiles(repo: string): Promise<string[]> {
  return (await gitOutput(repo, ["diff", "--name-only", "--diff-filter=U"])).split("\n").filter(Boolean);
}

/** 途中の操作がないことを確かめる（マージ中に別のマージを始めない） */
async function assertNoOperation(repo: string): Promise<void> {
  if (await gitOperation(repo)) throw new Invalid("マージ・リベースの途中です。変更タブで、取りやめるか続けるかを決めてから操作してください");
}

/**
 * マージ・リベースの前の見込み（いまのブランチと branch を合わせたときに衝突するファイル）。
 * 作業場所は変えない（git merge-tree で、合わせた結果を作業場所の外で作る）。リベースも同じ見込みを使う
 */
export async function mergePreview(repo: string, branch: string): Promise<GitMergePreview> {
  assertRefName(branch);
  // --is-ancestor は「先祖でない」を終了コード 1 で返すので、出力ではなく成否で見る
  const ancestor = (a: string, b: string) =>
    gitOutput(repo, ["merge-base", "--is-ancestor", a, b]).then(
      () => true,
      () => false,
    );
  if (await ancestor(branch, "HEAD")) return { up_to_date: true, fast_forward: false, conflicts: [] };
  if (await ancestor("HEAD", branch)) return { up_to_date: false, fast_forward: true, conflicts: [] };
  const out = await gitOutput(repo, ["merge-tree", "--write-tree", "--name-only", "--no-messages", "HEAD", branch], [1]);
  // 1 行目は合わせた木、続く行が衝突したファイル（なければ衝突しない）
  const conflicts = [...new Set(out.split("\n").slice(1).filter(Boolean))];
  return { up_to_date: false, fast_forward: false, conflicts };
}

/** ブランチ・タグの操作を 1 つ行う。衝突して止まったら、衝突したファイルを返す（止まっていなければ空） */
export async function runBranchAction(repo: string, a: GitBranchAction): Promise<{ conflicts: string[] }> {
  const done = { conflicts: [] as string[] };
  switch (a.action) {
    case "checkout":
      await gitOutput(repo, ["switch", "-q", assertRefName(a.branch)]);
      return done;
    case "checkout_remote": {
      await assertNewBranchName(repo, a.name);
      await gitOutput(repo, ["switch", "-q", "-c", a.name, "--track", assertRefName(a.remote_branch)]);
      return done;
    }
    case "checkout_detached":
      await gitOutput(repo, ["switch", "-q", "--detach", assertRefName(a.ref)]);
      return done;
    case "fast_forward": {
      const upstream = await upstreamOf(repo, assertRefName(a.branch));
      if (!upstream) throw new Invalid(`${a.branch} は追いかけているリモートのブランチがありません`);
      if ((await headBranch(repo)) === a.branch) await gitOutput(repo, ["merge", "-q", "--ff-only", upstream]);
      // いまのブランチでなければ、作業場所を変えずにブランチだけを早送りする（早送りできなければ git が断る）
      else await gitOutput(repo, ["fetch", "-q", ".", `${upstream}:${a.branch}`]);
      return done;
    }
    case "pull": {
      const upstream = await upstreamOf(repo, assertRefName(a.branch));
      if (!upstream) throw new Invalid(`${a.branch} は追いかけているリモートのブランチがありません`);
      const { remote, branch } = await splitRemoteBranch(repo, upstream);
      if ((await headBranch(repo)) === a.branch) {
        await assertNoOperation(repo);
        // 分かれていればマージする（衝突したら止まり、変更タブで解いてもらう）
        return runStoppable(repo, ["pull", "-q", "--no-rebase", "--no-edit", remote, branch]);
      }
      // いまのブランチでなければ、取ってきて早送りだけする（分かれていれば git が断る）
      await gitOutput(repo, ["fetch", "-q", remote, `${branch}:${a.branch}`], [], NETWORK_TIMEOUT);
      return done;
    }
    case "push":
    case "push_pr": {
      const upstream = await upstreamOf(repo, assertRefName(a.branch));
      if (upstream) {
        const { remote, branch } = await splitRemoteBranch(repo, upstream);
        await gitOutput(repo, ["push", "-q", remote, `${a.branch}:${branch}`], [], NETWORK_TIMEOUT);
      } else {
        const remotes = (await gitOutput(repo, ["remote"])).split("\n").filter(Boolean);
        if (!remotes.includes("origin")) throw new Invalid("プッシュ先のリモート（origin）がありません");
        await gitOutput(repo, ["push", "-q", "-u", "origin", a.branch], [], NETWORK_TIMEOUT);
      }
      return done;
    }
    case "merge":
    case "rebase": {
      assertRefName(a.branch);
      await assertNoOperation(repo);
      return runStoppable(repo, a.action === "merge" ? ["merge", "-q", "--no-edit", a.branch] : ["rebase", "-q", a.branch]);
    }
    case "create_branch":
      await assertNewBranchName(repo, a.name);
      await gitOutput(repo, a.checkout ? ["switch", "-q", "-c", a.name, assertRefName(a.from)] : ["branch", a.name, assertRefName(a.from)]);
      return done;
    case "create_tag": {
      assertRefName(a.name);
      if (await hasRef(repo, `refs/tags/${a.name}`)) throw new Invalid(`同じ名前のタグがあります: ${a.name}`);
      const message = a.message?.trim();
      await gitOutput(repo, message ? ["tag", "-a", a.name, "-m", message, assertRefName(a.at)] : ["tag", a.name, assertRefName(a.at)]);
      if (a.push) await gitOutput(repo, ["push", "-q", "origin", `refs/tags/${a.name}`], [], NETWORK_TIMEOUT);
      return done;
    }
    case "set_upstream":
      assertRefName(a.branch);
      await gitOutput(repo, a.upstream ? ["branch", `--set-upstream-to=${assertRefName(a.upstream)}`, a.branch] : ["branch", "--unset-upstream", a.branch]);
      return done;
    case "rename_branch":
      assertRefName(a.branch);
      await assertNewBranchName(repo, a.name);
      await gitOutput(repo, ["branch", "-m", a.branch, a.name]);
      return done;
    case "delete_branch": {
      assertRefName(a.branch);
      // リモートのブランチも消すなら、手元を消す前に追いかけている先を読んでおく
      const upstream = a.remote ? await upstreamOf(repo, a.branch) : null;
      await gitOutput(repo, ["branch", a.force ? "-D" : "-d", a.branch]);
      if (upstream) {
        const { remote, branch } = await splitRemoteBranch(repo, upstream);
        await gitOutput(repo, ["push", "-q", remote, "--delete", branch], [], NETWORK_TIMEOUT);
      }
      return done;
    }
    case "delete_remote_branch": {
      const { remote, branch } = await splitRemoteBranch(repo, assertRefName(a.remote_branch));
      await gitOutput(repo, ["push", "-q", remote, "--delete", branch], [], NETWORK_TIMEOUT);
      return done;
    }
    case "push_tag":
      await gitOutput(repo, ["push", "-q", "origin", `refs/tags/${assertRefName(a.name)}`], [], NETWORK_TIMEOUT);
      return done;
    case "delete_tag":
      await gitOutput(repo, ["tag", "-d", assertRefName(a.name)]);
      if (a.remote) await gitOutput(repo, ["push", "-q", "origin", "--delete", `refs/tags/${a.name}`], [], NETWORK_TIMEOUT);
      return done;
  }
}

/** 途中で止まっているマージ・リベースなどを、取りやめる・続ける・飛ばす。続けた先でまた衝突したら、衝突したファイルを返す */
export async function runOperationAction(repo: string, action: GitOperationAction): Promise<{ conflicts: string[] }> {
  const operation = await gitOperation(repo);
  if (!operation) throw new Invalid("途中の操作はありません");
  if (action === "abort") {
    await gitOutput(repo, [operation, "--abort"]);
    return { conflicts: [] };
  }
  if (action === "continue" && (await conflictedFiles(repo)).length > 0) throw new Invalid("まだ衝突しているファイルがあります。解決済みにしてから続けてください");
  if (action === "skip" && operation === "merge") throw new Invalid("マージは飛ばせません");
  // マージを続ける = 解いた中身でマージのコミットを作る（メッセージは git が用意したもの）
  const args = operation === "merge" ? ["commit", "-q", "--no-edit"] : [operation, action === "skip" ? "--skip" : "--continue"];
  return runStoppable(repo, args);
}

/** 衝突したファイルを解く（こちらの版・取り込む側の版を使う、またはいまの中身で解決済みにする）。どちらかの版で消えていれば消す */
export async function resolveConflict(repo: string, file: string, how: GitConflictResolution): Promise<void> {
  if (how !== "mark") {
    try {
      await gitOutput(repo, ["checkout", `--${how}`, "--", file]);
    } catch (e) {
      // 選んだ側でファイルが消えている（片方で削除）なら、消したことにする
      if (!/does not have (our|their) version/.test(String((e as Error).message))) throw e;
      await gitOutput(repo, ["rm", "-q", "--", file]);
      return;
    }
  }
  await gitOutput(repo, ["add", "-A", "--", file]);
}
