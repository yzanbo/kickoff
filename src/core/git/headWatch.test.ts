// HEAD の見張り: 作りかけのワークツリー（HEAD がまだ 0）が一覧にあれば、少しおいて取り直させる
import assert from "node:assert/strict";
import { test } from "vitest";
import type { GitWorktree } from "@shared/types";
import { afterTest } from "../testing/afterTest.js";
import { gitRepo } from "../testing/gitRepo.js";
import { until } from "../testing/testCore.js";
import { HeadWatch } from "./headWatch.js";

const worktree = (path: string, head: string, main = false): GitWorktree => ({ path, root: path, branch: main ? "main" : null, head, main, locked: !main, prunable: false });

test("作りかけのワークツリーがあれば 1 秒ほどで取り直させ、仕上がった一覧では取り直させない", async () => {
  const { dir } = gitRepo({ files: { "a.txt": "a\n" } });
  const changed: number[] = [];
  const watch = new HeadWatch((id) => changed.push(id));
  afterTest(() => watch.close());
  const main = worktree(dir, "1".repeat(40), true);
  await watch.watch(7, dir, [main, worktree(`${dir}-worktrees/new`, "0".repeat(40))]);
  await until(() => changed.length === 1, 3000);
  assert.deepEqual(changed, [7]);
  // 仕上がったら（本体だけ・HEAD がコミットを指す）取り直させない
  await watch.watch(7, dir, [main]);
  await new Promise((r) => setTimeout(r, 1300));
  assert.deepEqual(changed, [7]);
});
