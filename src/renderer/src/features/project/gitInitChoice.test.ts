import assert from "node:assert/strict";
import { test } from "node:test";
import type { FolderInspection } from "@shared/types";
import { gitInitChoice, gitManagedNote } from "./gitInitChoice";

const folder = (patch: Partial<FolderInspection> = {}): FolderInspection => ({
  path: "/w/app",
  exists: true,
  is_directory: true,
  is_git: false,
  git_root: null,
  has_commits: false,
  branch: null,
  remote_url: null,
  dirty: false,
  empty: false,
  parent_tracked: false,
  suggested_name: "app",
  ...patch,
});

test("git の管理: git でないフォルダは始める / 始めないを選び、管理済みの案内は出さない", () => {
  const info = folder();
  assert.equal(gitInitChoice(info)?.on, "git の管理を始める");
  assert.equal(gitManagedNote(info), null);
});

test("git の管理: コミットのあるリポジトリの一番上は選ばせず、すでに管理されている旨（ブランチ）を出す", () => {
  const info = folder({ is_git: true, git_root: "/w/app", has_commits: true, branch: "main" });
  assert.equal(gitInitChoice(info), null);
  assert.match(gitManagedNote(info) ?? "", /すでに git で管理されています（ブランチ: main）/);
});

test("git の管理: リポジトリの中のフォルダは、親が中を管理していれば案内だけ、していなければ新しく始めるかを選ぶ", () => {
  const tracked = folder({ path: "/w/repo/app", is_git: true, git_root: "/w/repo", has_commits: true, parent_tracked: true });
  assert.equal(gitInitChoice(tracked), null);
  assert.match(gitManagedNote(tracked) ?? "", /親のリポジトリ（\/w\/repo）/);
  const loose = folder({ path: "/w/repo/app", is_git: true, git_root: "/w/repo", has_commits: true });
  assert.equal(gitInitChoice(loose)?.off, "親のリポジトリの中で使う");
  assert.equal(gitManagedNote(loose), null);
});

test("git の管理: コミットのないリポジトリは始めるかを選び、ないフォルダはどちらも出さない", () => {
  assert.notEqual(gitInitChoice(folder({ is_git: true, git_root: "/w/app" })), null);
  assert.equal(gitInitChoice(folder({ exists: false })), null);
  assert.equal(gitManagedNote(folder({ exists: false })), null);
});
