import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FileContent, GitChangeKind, GitCommit, GitCommitDetail, GitDiff, GitFileChange, GitLog, GitRefs, GitStatus, GitWorktree, ProjectFiles, ProjectSearchQuery, ProjectSearchResult } from "./types.js";

const execFileAsync = promisify(execFile);

/** 差分を返す上限（これより大きければ途中で切る） */
const MAX_DIFF_CHARS = 400_000;
/** ファイルの一覧の上限（大きなリポジトリでも重くならないように） */
const MAX_FILES = 20_000;
/** ファイルの中身を返す上限（バイト） */
const MAX_FILE_BYTES = 1_000_000;

/**
 * git を実行して標準出力をそのまま返す。okCodes の終了コードは失敗にしない
 * （git diff --no-index は差があると 1 で終わる）
 */
export async function gitOutput(cwd: string, args: string[], okCodes: number[] = [], timeout = 30_000): Promise<string> {
  try {
    // パスワードなどを聞かれても答えられないので、待たずに失敗させる
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown };
    if (typeof err.code === "number" && okCodes.includes(err.code) && typeof err.stdout === "string") return err.stdout;
    // git の説明（stderr）があれば、それを失敗の文にする
    const detail = typeof err.stderr === "string" ? err.stderr.trim() : "";
    throw detail ? new Error(detail) : e;
  }
}

const KINDS = new Set<GitChangeKind>(["M", "A", "D", "R", "C", "T"]);
const kindOf = (code: string): GitChangeKind => (KINDS.has(code as GitChangeKind) ? (code as GitChangeKind) : "M");
/** 競合している状態（両方で変更・片方で削除など） */
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** `## main...origin/main [ahead 1, behind 2]` からブランチと進み・遅れを読む */
function parseBranch(line: string): { branch: string | null; upstream: string | null; ahead: number; behind: number } {
  const text = line.replace(/^## /, "");
  const ahead = Number(/ahead (\d+)/.exec(text)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(text)?.[1] ?? 0);
  // コミットがまだないとき: "No commits yet on main"（古い git は "Initial commit on main"）
  const initial = /^(?:No commits yet|Initial commit) on (.+)$/.exec(text);
  if (initial) return { branch: initial[1], upstream: null, ahead, behind };
  if (text.startsWith("HEAD (no branch)")) return { branch: null, upstream: null, ahead, behind };
  const upstream = /\.\.\.(\S+)/.exec(text)?.[1] ?? null;
  return { branch: text.split(/\.\.\.| /)[0] || null, upstream, ahead, behind };
}

/** `git status --porcelain=v1 -z --branch` の出力を読む */
export function parseGitStatus(raw: string): Extract<GitStatus, { repo: true }> {
  const records = raw.split("\0");
  const status: Extract<GitStatus, { repo: true }> = { repo: true, branch: null, upstream: null, hasOrigin: false, ahead: 0, behind: 0, staged: [], unstaged: [], conflicts: [] };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.startsWith("## ")) {
      Object.assign(status, parseBranch(record));
      continue;
    }
    const code = record.slice(0, 2);
    const file = record.slice(3);
    const [x, y] = code;
    // 名前の変更・コピーは、次の区切りに元のパスが入る
    const oldPath = x === "R" || x === "C" || y === "R" || y === "C" ? records[++i] : undefined;
    const change = (kind: GitChangeKind): GitFileChange => (oldPath ? { path: file, old_path: oldPath, kind } : { path: file, kind });
    if (code === "??") status.unstaged.push(change("U"));
    else if (CONFLICTS.has(code)) status.conflicts.push(change("!"));
    else {
      if (x !== " ") status.staged.push(change(kindOf(x)));
      if (y !== " ") status.unstaged.push(change(kindOf(y)));
    }
  }
  return status;
}

/** プロジェクトのフォルダの Git の状態（Git で管理されていなければ repo: false） */
export async function gitStatus(repo: string): Promise<GitStatus> {
  const inside = await gitOutput(repo, ["rev-parse", "--is-inside-work-tree"]).then(
    (out) => out.trim() === "true",
    () => false,
  );
  if (!inside) return { repo: false };
  const [raw, remotes] = await Promise.all([
    gitOutput(repo, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]),
    gitOutput(repo, ["remote"]),
  ]);
  return { ...parseGitStatus(raw), hasOrigin: remotes.split("\n").includes("origin") };
}

/** リポジトリの中のパスか（外のファイルを読ませない）。リポジトリの中の絶対パスを返す */
async function assertInside(repo: string, file: string): Promise<string> {
  const root = await fs.realpath(repo);
  const target = path.resolve(root, file);
  if (path.isAbsolute(file) || !target.startsWith(root + path.sep)) throw new Error("リポジトリの外のファイルです");
  return target;
}

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
  const binary = /^Binary files .* differ$/m.test(diff) || diff.includes("GIT binary patch");
  const truncated = diff.length > MAX_DIFF_CHARS;
  return { diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff, binary, truncated };
}

const nulList = (out: string) => out.split("\0").filter(Boolean);

/**
 * エクスプローラーに出すファイルの一覧（Git で管理していなければ null）。
 * 管理しているファイルと、まだ追加していないファイル（消したファイルは除く）。.gitignore で無視しているものは、
 * フォルダなら中を開かずにまとめて返す（node_modules などを全部たどらないように）
 */
export async function listProjectFiles(repo: string): Promise<ProjectFiles | null> {
  if ((await gitStatus(repo)).repo === false) return null;
  const [all, deleted, ignored] = await Promise.all([
    gitOutput(repo, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]),
    gitOutput(repo, ["ls-files", "--deleted", "-z"]),
    gitOutput(repo, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]),
  ]);
  const gone = new Set(nulList(deleted));
  const files = [...new Set(nulList(all))].filter((f) => !gone.has(f)).sort();
  return {
    files: files.slice(0, MAX_FILES),
    ignored: nulList(ignored).map((p) => (p.endsWith("/") ? { path: p.slice(0, -1), dir: true } : { path: p, dir: false })),
    truncated: files.length > MAX_FILES,
  };
}

/** 中身の指紋（保存の前に、開いたあとでほかで変わっていないか比べる） */
const hashOf = (data: Buffer) => createHash("sha1").update(data).digest("hex");

/** リポジトリの中の、実体のパス（リポジトリの外を指すシンボリックリンクは使わせない） */
async function resolveInside(repo: string, file: string): Promise<string> {
  const real = await fs.realpath(await assertInside(repo, file));
  await assertInside(repo, path.relative(await fs.realpath(repo), real));
  return real;
}

/** 開いたあとで、ほかで（エージェントなどが）ファイルを変えていた */
export class FileConflictError extends Error {}

/**
 * ファイルを保存する（いまあるファイルだけ）。baseHash は開いたときの指紋で、いまの中身と違えば上書きせずに
 * FileConflictError にする（エージェントの作業を消さないため）。null なら確かめずに上書きする
 */
export async function writeProjectFile(repo: string, file: string, content: string, baseHash: string | null): Promise<{ hash: string }> {
  const real = await resolveInside(repo, file);
  if (!(await fs.stat(real)).isFile()) throw new Error("ファイルではありません");
  if (baseHash !== null && hashOf(await fs.readFile(real)) !== baseHash) {
    throw new FileConflictError("開いたあとで、ほかでファイルが変わりました");
  }
  const data = Buffer.from(content, "utf8");
  await fs.writeFile(real, data);
  return { hash: hashOf(data) };
}

/** ファイルの中身（リポジトリの外を指すシンボリックリンクは読まない） */
export async function readProjectFile(repo: string, file: string): Promise<FileContent> {
  const real = await resolveInside(repo, file);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error("ファイルではありません");
  const handle = await fs.open(real, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_FILE_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
    // 先頭に NUL があればバイナリとみなす（git と同じ考え方）
    const binary = buffer.subarray(0, 8000).includes(0);
    const truncated = stat.size > MAX_FILE_BYTES;
    return { content: binary ? "" : buffer.toString("utf8"), hash: binary || truncated ? "" : hashOf(buffer), binary, truncated };
  } finally {
    await handle.close();
  }
}

/** 検索で返す行の上限・1 ファイルあたりの上限・1 行の長さの上限 */
const MAX_MATCHES = 2000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_LINE_CHARS = 400;

/**
 * プロジェクトのファイルの中を探す（git grep。.gitignore で無視しているもの・バイナリは除く。未追加のファイルは含める）。
 * 正規表現の書き方が正しくなければ失敗する
 */
export async function searchProject(repo: string, { query, caseSensitive, wholeWord, regex }: ProjectSearchQuery): Promise<ProjectSearchResult> {
  const result: ProjectSearchResult = { files: [], total: 0, truncated: false };
  if (!query) return result;
  const args = ["grep", "-n", "--column", "-I", "--untracked", "-z", `--max-count=${MAX_MATCHES_PER_FILE}`];
  if (!caseSensitive) args.push("-i");
  if (wholeWord) args.push("-w");
  args.push(regex ? "-E" : "-F", "-e", query);
  // 見つからなければ終了コード 1
  const out = await gitOutput(repo, args, [1]);
  for (const record of out.split("\n")) {
    if (!record) continue;
    const [file, line, column, ...rest] = record.split("\0");
    if (result.total >= MAX_MATCHES) {
      result.truncated = true;
      break;
    }
    const text = rest.join("\0");
    let entry = result.files.at(-1);
    if (entry?.path !== file) result.files.push((entry = { path: file, matches: [] }));
    entry.matches.push({ line: Number(line), column: Number(column), text: text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text });
    result.total++;
  }
  return result;
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
  const hasHead = await gitOutput(repo, ["rev-parse", "--verify", "-q", "HEAD"]).then(
    () => true,
    () => false,
  );
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
  if (!status.hasOrigin) throw new Error("プッシュ先のリモート（origin）がありません");
  await gitOutput(repo, ["push", "-q", "-u", "origin", status.branch], [], 120_000);
}

/** 履歴の区切り（コミットの間は RS、項目の間は NUL） */
const LOG_FORMAT = "%H%x00%P%x00%an%x00%ae%x00%aI%x00%D%x00%s%x1e";
const HASH_RE = /^[0-9a-f]{4,64}$/i;

function parseCommit(record: string): GitCommit {
  const [hash, parents, author, email, date, refs, subject] = record.replace(/^\n/, "").split("\0");
  return {
    hash,
    parents: parents ? parents.split(" ") : [],
    author,
    email,
    date,
    refs: refs ? refs.split(", ") : [],
    subject,
  };
}

/** 履歴（すべてのブランチ。新しい順で、親より子が先。skip 件目から limit 件） */
export async function gitLog(repo: string, skip = 0, limit = 200): Promise<GitLog> {
  // コミットがまだなければ空
  const hasHead = await gitOutput(repo, ["rev-parse", "--verify", "-q", "HEAD"]).then(
    () => true,
    () => false,
  );
  if (!hasHead) return { commits: [], more: false };
  const out = await gitOutput(repo, ["log", "--all", "--topo-order", `--format=${LOG_FORMAT}`, `--skip=${skip}`, `-n`, String(limit + 1)]);
  const commits = out.split("\x1e").filter((r) => r.trim()).map(parseCommit);
  return { commits: commits.slice(0, limit), more: commits.length > limit };
}

/** 名前の変わったファイルなども含めた、変わったファイルの一覧（git diff --name-status -z の出力を読む） */
function parseNameStatus(out: string): GitFileChange[] {
  const parts = out.split("\0").filter(Boolean);
  const files: GitFileChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i];
    const kind = kindOf(code[0]);
    if (code[0] === "R" || code[0] === "C") {
      files.push({ old_path: parts[i + 1], path: parts[i + 2], kind });
      i += 2;
    } else {
      files.push({ path: parts[i + 1], kind });
      i += 1;
    }
  }
  return files;
}

/** コミットの詳細（マージは 1 つ目の親との差、最初のコミットは空との差） */
export async function gitCommitDetail(repo: string, hash: string): Promise<GitCommitDetail> {
  if (!HASH_RE.test(hash)) throw new Error("コミットの指定が正しくありません");
  const head = await gitOutput(repo, ["show", "-s", `--format=${LOG_FORMAT.replace("%x1e", "")}%x00%cn%x00%cI%x00%B`, hash]);
  const [hashFull, parents, author, email, date, refs, subject, committer, committedAt, ...body] = head.split("\0");
  const commit = parseCommit([hashFull, parents, author, email, date, refs, subject].join("\0"));
  const parent = commit.parents[0];
  const changes = parent
    ? await gitOutput(repo, ["diff", "--name-status", "-M", "-z", parent, commit.hash])
    : await gitOutput(repo, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", commit.hash]);
  return { ...commit, body: body.join("\0").trim(), committer, committedAt: committedAt, files: parseNameStatus(changes) };
}

/** コミットでの 1 つのファイルの差分（1 つ目の親との差。最初のコミットは空との差） */
export async function gitCommitDiff(repo: string, hash: string, file: string, oldPath?: string): Promise<GitDiff> {
  if (!HASH_RE.test(hash)) throw new Error("コミットの指定が正しくありません");
  await assertInside(repo, file);
  if (oldPath) await assertInside(repo, oldPath);
  const paths = oldPath ? ["--", oldPath, file] : ["--", file];
  const parents = (await gitOutput(repo, ["show", "-s", "--format=%P", hash])).trim();
  const parent = parents.split(" ")[0];
  const diff = parent
    ? await gitOutput(repo, ["diff", "--no-color", "--no-ext-diff", "-M", parent, hash, ...paths])
    : await gitOutput(repo, ["show", "--no-color", "--no-ext-diff", "--format=", hash, ...paths]);
  const binary = /^Binary files .* differ$/m.test(diff) || diff.includes("GIT binary patch");
  const truncated = diff.length > MAX_DIFF_CHARS;
  return { diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff, binary, truncated };
}

/** ブランチ・リモート・タグ・stash（履歴の左の一覧） */
export async function gitRefs(repo: string): Promise<GitRefs> {
  const refs: GitRefs = { branches: [], remotes: [], tags: [], stashes: [] };
  const out = await gitOutput(repo, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track)%00%(HEAD)",
    "refs/heads",
    "refs/remotes",
    "refs/tags",
  ]);
  for (const line of out.split("\n").filter(Boolean)) {
    const [ref, object, peeled, upstream, track, head] = line.split("\0");
    // 注釈つきのタグは、指しているコミットを使う
    const hash = peeled || object;
    if (ref.startsWith("refs/heads/")) {
      refs.branches.push({
        name: ref.slice(11),
        hash,
        current: head === "*",
        upstream: upstream || null,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
      });
    } else if (ref.startsWith("refs/remotes/")) {
      const name = ref.slice(13);
      if (name.endsWith("/HEAD")) continue;
      const remote = name.slice(0, name.indexOf("/"));
      let group = refs.remotes.find((r) => r.name === remote);
      if (!group) refs.remotes.push((group = { name: remote, branches: [] }));
      group.branches.push({ name, hash });
    } else if (ref.startsWith("refs/tags/")) {
      refs.tags.push({ name: ref.slice(10), hash });
    }
  }
  const stashes = await gitOutput(repo, ["stash", "list", "--format=%gd%x00%H%x00%s"]).catch(() => "");
  for (const line of stashes.split("\n").filter(Boolean)) {
    const [ref, hash, message] = line.split("\0");
    refs.stashes.push({ ref, hash, message });
  }
  return refs;
}

/** `git worktree list --porcelain` を読む（空行で区切られた塊ごとに 1 つ。最初が本体） */
export function parseWorktrees(out: string): GitWorktree[] {
  return out
    .split("\n\n")
    .map((block) => block.split("\n").filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines, i) => {
      const field = (name: string) => lines.find((l) => l === name || l.startsWith(`${name} `));
      const branch = field("branch")?.slice(7) ?? null;
      return {
        path: field("worktree")?.slice(9) ?? "",
        branch: branch?.startsWith("refs/heads/") ? branch.slice(11) : branch,
        head: field("HEAD")?.slice(5) ?? "",
        main: i === 0,
        locked: Boolean(field("locked")),
        prunable: Boolean(field("prunable")),
      };
    });
}

export async function listWorktrees(repo: string): Promise<GitWorktree[]> {
  return parseWorktrees(await gitOutput(repo, ["worktree", "list", "--porcelain"]));
}

/** 新しいワークツリーを置くフォルダ（リポジトリの隣の <名前>-worktrees/<ブランチ名>。/ は - にする） */
export async function worktreePathFor(repo: string, branch: string): Promise<string> {
  const root = await fs.realpath(repo);
  return path.join(path.dirname(root), `${path.basename(root)}-worktrees`, branch.replace(/[\\/]+/g, "-"));
}

/**
 * ワークツリーを作る。ブランチがなければいまのコミットから作り、あればそのブランチを取り出す。
 * 置き場所は worktreePathFor で決める（すでにあれば失敗する）
 */
export async function addWorktree(repo: string, branch: string): Promise<GitWorktree[]> {
  await gitOutput(repo, ["check-ref-format", "--branch", branch]).catch(() => {
    throw new Error("ブランチの名前に使えない文字があります");
  });
  const target = await worktreePathFor(repo, branch);
  if (await fs.stat(target).catch(() => null)) throw new Error(`フォルダがすでにあります: ${target}`);
  const exists = await gitOutput(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).then(
    () => true,
    () => false,
  );
  await gitOutput(repo, exists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target]);
  return listWorktrees(repo);
}

/** ワークツリーを消す（本体は消せない。force: コミットしていない変更があっても消す）。なくなったものの記録も片付ける */
export async function removeWorktree(repo: string, target: string, force: boolean): Promise<GitWorktree[]> {
  const worktree = (await listWorktrees(repo)).find((w) => w.path === target);
  if (!worktree) throw new Error("ワークツリーが見つかりません");
  if (worktree.main) throw new Error("本体のフォルダは消せません");
  if (worktree.prunable) await gitOutput(repo, ["worktree", "prune"]);
  else await gitOutput(repo, ["worktree", "remove", ...(force ? ["--force"] : []), target]);
  return listWorktrees(repo);
}

/** リモートの変更を取ってきて、いまのブランチを早送りで最新にする（手元の変更とぶつかるときは失敗する） */
export async function pullBranch(repo: string): Promise<void> {
  await gitOutput(repo, ["pull", "--ff-only", "-q"], [], 120_000);
}

/**
 * PR がマージされたワークツリーを片付ける（ワークツリーと手元のブランチを消す）。
 * GitHub で squash などでマージすると手元では「マージ済み」にならないので、ブランチは -D で消す（画面で確かめてから呼ぶ）
 */
export async function finishWorktree(repo: string, target: string): Promise<GitWorktree[]> {
  const worktree = (await listWorktrees(repo)).find((w) => w.path === target);
  if (!worktree) throw new Error("ワークツリーが見つかりません");
  if (worktree.main) throw new Error("本体のフォルダは片付けられません");
  await gitOutput(repo, ["worktree", "remove", target]);
  if (worktree.branch) await gitOutput(repo, ["branch", "-D", worktree.branch]);
  return listWorktrees(repo);
}
