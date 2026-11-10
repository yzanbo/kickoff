// 行ごとの変更の記録（git blame。エディタのいまの行の右に、いつ誰が変えたかを出す）
import type { GitBlame, GitBlameCommit } from "@shared/types";
import { gitOutput } from "./exec.js";
import { assertInside } from "./files.js";

/** まだコミットしていない行のハッシュ（git blame が 0 を並べて返す） */
const UNCOMMITTED = /^0+$/;

/**
 * git blame --porcelain の出力を、コミットの一覧と行ごとの位置にする。同じコミットの 2 つ目からは見出しの行（author など）が省かれるので、
 * 初めて出たときに読んだものを使う。youEmail は自分の git の user.email（大文字・小文字は区別しない。空なら自分の印は付けない）
 */
export function parseBlame(out: string, youEmail: string): GitBlame {
  const commits: GitBlameCommit[] = [];
  const index = new Map<string, number>();
  const lines: number[] = [];
  const you = youEmail.trim().toLowerCase();
  let current: GitBlameCommit | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("\t")) {
      // 行の中身（ここで 1 行分が終わる）
      if (current) lines.push(index.get(current.hash) ?? 0);
      continue;
    }
    const head = /^([0-9a-f]{40,64}) \d+ \d+/.exec(line);
    if (head) {
      const hash = head[1];
      const known = index.get(hash);
      if (known !== undefined) {
        current = commits[known];
        continue;
      }
      current = { hash, author: "", email: "", date: "", summary: "", uncommitted: UNCOMMITTED.test(hash), you: false };
      index.set(hash, commits.length);
      commits.push(current);
      continue;
    }
    if (!current) continue;
    const space = line.indexOf(" ");
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? "" : line.slice(space + 1);
    if (key === "author") current.author = value;
    else if (key === "author-mail") current.email = value.replace(/^<|>$/g, "");
    else if (key === "author-time") current.date = new Date(Number(value) * 1000).toISOString();
    else if (key === "summary") current.summary = value;
  }
  for (const commit of commits) commit.you = commit.uncommitted || (you !== "" && commit.email.toLowerCase() === you);
  return { commits, lines };
}

/**
 * ファイルの行ごとの変更の記録（作業場所のいまの中身で見る。まだコミットしていない行は uncommitted）。
 * Git で管理していない・まだコミットのないファイルは null（git blame が 128 で終わる）
 */
export async function gitBlame(repo: string, file: string): Promise<GitBlame | null> {
  await assertInside(repo, file);
  const out = await gitOutput(repo, ["blame", "--porcelain", "--", `./${file}`], [128]);
  if (!out.trim()) return null;
  const email = await gitOutput(repo, ["config", "user.email"], [1]).catch(() => "");
  return parseBlame(out, email);
}
