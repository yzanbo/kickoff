// HEAD の見張り: 作りかけのワークツリー（HEAD がまだ 0）が一覧にあれば、少しおいて取り直させる
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { test, vi } from "vitest";
import type { GitWorktree } from "@shared/types";
import { afterTest } from "../testing/afterTest.js";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";
import { until } from "../testing/testCore.js";
import { HeadWatch } from "./headWatch.js";

const worktree = (path: string, head: string, main = false): GitWorktree => ({ path, root: path, branch: main ? "main" : null, head, main, locked: !main, prunable: false });

test("本体とワークツリーの HEAD の置き換え、ワークツリー一覧の変更だけを知らせる", async () => {
  const watchers = new Map<string, fs.FSWatcher>();
  const mockedWatch = vi.spyOn(fs, "watch").mockImplementation((dir, listener) => {
    const watcher = Object.assign(new EventEmitter(), { close() {}, unref() { return this; } }) as fs.FSWatcher;
    if (typeof listener === "function") watcher.on("change", listener);
    watchers.set(String(dir), watcher);
    return watcher;
  });
  afterTest(() => mockedWatch.mockRestore());
  const { dir } = gitRepo({ files: { "a.txt": "a\n" } });
  const wt = path.join(tempDir(), "wt");
  gitIn(dir)("worktree", "add", "-q", "-b", "feat/a", wt);
  const changed: number[] = [];
  const watch = new HeadWatch((id) => changed.push(id));
  afterTest(() => watch.close());
  await watch.watch(7, dir, [worktree(dir, "1".repeat(40), true), worktree(wt, "1".repeat(40))]);
  const common = gitIn(dir)("rev-parse", "--absolute-git-dir").trim();
  const linked = gitIn(wt)("rev-parse", "--absolute-git-dir").trim();
  watchers.get(common)!.emit("change", "rename", "index");
  watchers.get(linked)!.emit("change", "rename", "HEAD.lock");
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(changed, []);
  watchers.get(common)!.emit("change", "rename", "HEAD");
  await until(() => changed.length === 1);
  watchers.get(linked)!.emit("change", "rename", "HEAD");
  await until(() => changed.length === 2);
  watchers.get(path.join(common, "worktrees"))!.emit("change", "rename", path.basename(linked));
  await until(() => changed.length === 3);
  assert.deepEqual(changed, [7, 7, 7]);
});

test("作りかけのワークツリーがあれば 1 秒ほどで取り直させ、仕上がった一覧では取り直させない", async () => {
  // このテストが確かめるのはタイマー。OS の監視エラーの通知とは独立させる。
  const mockedWatch = vi.spyOn(fs, "watch").mockImplementation(() => Object.assign(new EventEmitter(), { close() {}, unref() { return this; } }) as fs.FSWatcher);
  afterTest(() => mockedWatch.mockRestore());
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
