// ワークツリーを消す前の控え: 途中の変更（コミットしていないもの。まだ Git にないファイルも）と
// ブランチの先を、Git の参照 refs/kickoff/trash/<ゴミ箱の ID>/… に入れておく（3 日たったらゴミ箱の片付けで消す）。
// 戻すときは、同じ名前でワークツリーを作り直し、ブランチと途中の変更を戻す
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { git } from "@/foundation/core/workplace/git";
import { changedCount } from "@/foundation/core/workplace/reads";

/** 控えの参照の頭（ゴミ箱の ID ごとに、ブランチの先 branch と途中の変更 changes） */
const TRASH_REF_PREFIX = "refs/kickoff/trash";

/** ゴミ箱の ID の控えの参照 */
export const trashRef = (id: string, part: "branch" | "changes") => `${TRASH_REF_PREFIX}/${id}/${part}`;

/**
 * 作業ツリーの中身（コミットしていない変更・まだ Git にないファイル。Git で無視しているものは除く）を、HEAD を親にしたコミットにする
 * （作業ツリー・索引は変えない。一時の索引を使う）。変更がなければ null
 */
export async function snapshotWorkingTree(root: string): Promise<string | null> {
  if ((await changedCount(root)) === 0) return null;
  const index = path.join(os.tmpdir(), `kickoff-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(root).run(["read-tree", "HEAD"], { env });
    await git(root, { timeout: 120_000 }).run(["add", "-A"], { env });
    const tree = (await git(root).run(["write-tree"], { env })).trim();
    return git(root).text(["commit-tree", tree, "-p", "HEAD", "-m", "Kickoff: ワークツリーを消す前の途中の変更"]);
  } finally {
    await fs.rm(index, { force: true });
  }
}

/** 控えの参照を作る（ブランチの先・途中の変更のうち、あるものだけ） */
export async function saveTrashRefs(repo: string, id: string, refs: { branch: string | null; changes: string | null }): Promise<void> {
  if (refs.branch) await git(repo).run(["update-ref", trashRef(id, "branch"), refs.branch]);
  if (refs.changes) await git(repo).run(["update-ref", trashRef(id, "changes"), refs.changes]);
}

/** 控えの参照を消す（もうなければ何もしない） */
export async function dropTrashRefs(repo: string, id: string): Promise<void> {
  for (const part of ["branch", "changes"] as const) await git(repo).maybe(["update-ref", "-d", trashRef(id, part)]);
}

/**
 * 途中の変更の控え（snapshotWorkingTree のコミット）を、作り直したワークツリーにコミットしていない変更として戻す
 * （控えの中身を作業ツリーに書き、控えで消えていたファイルを消し、索引は HEAD のままにする）
 */
export async function applySnapshot(root: string, snapshot: string): Promise<void> {
  await git(root).run(["checkout", snapshot, "--", "."]);
  const deleted = (await git(root).run(["diff", "--name-only", "--diff-filter=D", "-z", "HEAD", snapshot])).split("\0").filter(Boolean);
  for (const file of deleted) await fs.rm(path.join(root, file), { force: true });
  await git(root).run(["reset", "-q"]);
}
