// 作業ツリーの状態（git status）と途中の操作（変更の読み方は @/foundation/core/workplace/status、参照・ブランチ・remote は reads）
import fs from "node:fs";
import path from "node:path";
import type { GitOperation, GitStatus } from "@shared/git/types";
import { git } from "@/foundation/core/workplace/git";
import { gitPrefix, listRemotes } from "@/foundation/core/workplace/reads";
import { statusIn } from "@/foundation/core/workplace/status";

/** 途中の操作と、それがあるときにできる印のファイル（.git の中。ワークツリーなら、そのワークツリーの分） */
const OPERATION_MARKS: [GitOperation, string][] = [
  ["rebase", "rebase-merge"],
  ["rebase", "rebase-apply"],
  ["merge", "MERGE_HEAD"],
  ["cherry-pick", "CHERRY_PICK_HEAD"],
  ["revert", "REVERT_HEAD"],
];

/** 途中で止まっている操作（マージ・リベースなどで衝突して止まっているもの。なければ null） */
export async function gitOperation(repo: string): Promise<GitOperation | null> {
  const out = await git(repo).run(["rev-parse", ...OPERATION_MARKS.flatMap(([, mark]) => ["--git-path", mark])]);
  const paths = out.split("\n").filter(Boolean);
  for (const [i, [operation]] of OPERATION_MARKS.entries()) {
    const mark = paths[i];
    if (mark && fs.existsSync(path.resolve(repo, mark))) return operation;
  }
  return null;
}

/** プロジェクトのフォルダの Git の状態（Git で管理されていなければ repo: false）。リポジトリの中のフォルダなら、その中の変更だけ */
export async function gitStatus(repo: string): Promise<GitStatus> {
  const prefix = await gitPrefix(repo);
  if (prefix === null) return { repo: false };
  const [status, remotes, operation] = await Promise.all([statusIn(repo, prefix), listRemotes(repo), gitOperation(repo)]);
  return { repo: true, ...status, has_origin: remotes.includes("origin"), operation };
}
