// 履歴（git log・コミットの詳細と差分・ブランチやタグの一覧）
import type { GitCommit, GitCommitDetail, GitDiff, GitFileChange, GitLog, GitRefs } from "../types.js";
import { toGitDiff } from "./changes.js";
import { gitOutput } from "./exec.js";
import { assertInside } from "./files.js";
import { kindOf } from "./status.js";

/** 履歴の区切り（コミットの間は RS、項目の間は NUL） */
const LOG_FORMAT = "%H%x00%P%x00%an%x00%ae%x00%aI%x00%D%x00%s%x1e";
const HASH_RE = /^[0-9a-f]{4,64}$/i;

/** git log の 1 件（LOG_FORMAT の並び）を読む */
export function parseCommit(record: string): GitCommit {
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
export function parseNameStatus(out: string): GitFileChange[] {
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
  return toGitDiff(diff);
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
