// HEAD の見張り: 作りかけのワークツリー（HEAD がまだ 0）が一覧にあれば、少しおいて取り直させる
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { test, vi } from "vitest";
import { makeProject } from "@shared/projects/testing";
import { makeWorktree } from "@shared/foundation/testing/data";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { gitIn, gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { HeadWatch, unwatchedProject } from "./headWatch";

const worktree = (path: string, head: string, main = false) => makeWorktree(path, { branch: main ? "main" : null, head, main, locked: !main });

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
  const clock = manualClock();
  const watch = new HeadWatch((id) => changed.push(id), clock);
  afterTest(() => watch.close());
  await watch.watch(7, dir, [worktree(dir, "1".repeat(40), true), worktree(wt, "1".repeat(40))]);
  const common = gitIn(dir)("rev-parse", "--absolute-git-dir").trim();
  const linked = gitIn(wt)("rev-parse", "--absolute-git-dir").trim();
  watchers.get(common)!.emit("change", "rename", "index");
  watchers.get(linked)!.emit("change", "rename", "HEAD.lock");
  // HEAD でない変化は知らせを予約しない
  assert.equal(clock.pending, 0);
  // HEAD の置き換えは、まとめる間（150ms）をおいて 1 回知らせる
  watchers.get(common)!.emit("change", "rename", "HEAD");
  await clock.advance(149);
  assert.deepEqual(changed, []);
  await clock.advance(1);
  assert.equal(changed.length, 1);
  watchers.get(linked)!.emit("change", "rename", "HEAD");
  await clock.advance(150);
  assert.equal(changed.length, 2);
  watchers.get(path.join(common, "worktrees"))!.emit("change", "rename", path.basename(linked));
  await clock.advance(150);
  assert.equal(changed.length, 3);
  assert.deepEqual(changed, [7, 7, 7]);
});

test("作りかけのワークツリーがあれば 1 秒ほどで取り直させ、仕上がった一覧では取り直させない", async () => {
  // このテストが確かめるのはタイマー。OS の監視エラーの通知とは独立させる。
  const mockedWatch = vi.spyOn(fs, "watch").mockImplementation(() => Object.assign(new EventEmitter(), { close() {}, unref() { return this; } }) as fs.FSWatcher);
  afterTest(() => mockedWatch.mockRestore());
  const { dir } = gitRepo({ files: { "a.txt": "a\n" } });
  const changed: number[] = [];
  const clock = manualClock();
  const watch = new HeadWatch((id) => changed.push(id), clock);
  afterTest(() => watch.close());
  const main = worktree(dir, "1".repeat(40), true);
  await watch.watch(7, dir, [main, worktree(`${dir}-worktrees/new`, "0".repeat(40))]);
  await clock.advance(999);
  assert.deepEqual(changed, []);
  await clock.advance(1);
  assert.deepEqual(changed, [7]);
  // 仕上がったら（本体だけ・HEAD がコミットを指す）取り直させない
  await watch.watch(7, dir, [main]);
  assert.equal(clock.pending, 0);
  await clock.advance(1300);
  assert.deepEqual(changed, [7]);
});

test("消した・アーカイブしたプロジェクトは見張りを外し、そのあとの HEAD の変化を知らせない（B07-6）", async () => {
  const watchers = new Map<string, fs.FSWatcher & { closed?: boolean }>();
  const mockedWatch = vi.spyOn(fs, "watch").mockImplementation((dir, listener) => {
    const emitter = new EventEmitter();
    // 閉じた見張りは、本物と同じくもう呼ばない
    const watcher = Object.assign(emitter, { closed: false, close() { watcher.closed = true; emitter.removeAllListeners(); }, unref() { return watcher; } }) as unknown as fs.FSWatcher & { closed?: boolean };
    if (typeof listener === "function") watcher.on("change", listener);
    watchers.set(String(dir), watcher);
    return watcher;
  });
  afterTest(() => mockedWatch.mockRestore());
  const { dir } = gitRepo({ files: { "a.txt": "a\n" } });
  const changed: number[] = [];
  const clock = manualClock();
  const watch = new HeadWatch((id) => changed.push(id), clock);
  afterTest(() => watch.close());
  await watch.watch(7, dir, [worktree(dir, "1".repeat(40), true)]);
  const common = gitIn(dir)("rev-parse", "--absolute-git-dir").trim();
  watch.unwatch(7);
  assert.equal(watchers.get(common)!.closed, true);
  watchers.get(common)!.emit("change", "rename", "HEAD");
  assert.equal(clock.pending, 0);
  await clock.advance(200);
  assert.deepEqual(changed, []);
  // 見張りを外すのは、消した・アーカイブしたプロジェクトの知らせだけ
  assert.equal(unwatchedProject({ type: "project_deleted", id: 7 }), 7);
  assert.equal(unwatchedProject({ type: "project", project: makeProject(8, { archived_at: "2026-11-23T00:00:00Z" }) }), 8);
  assert.equal(unwatchedProject({ type: "project", project: makeProject(8, { archived_at: null }) }), null);
  assert.equal(unwatchedProject({ type: "worktrees_changed", project_id: 7 }), null);
});
