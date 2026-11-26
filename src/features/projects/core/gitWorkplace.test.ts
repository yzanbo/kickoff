import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { hasGitWorkplace } from "./gitWorkplace";

test("利用者のプロジェクトは本体が Git の作業ツリーのときだけ Git の作業場所を持つ", async () => {
  const { dir } = gitRepo();
  assert.equal(await hasGitWorkplace({ kind: null, repo_path: dir }), true);
  assert.equal(await hasGitWorkplace({ kind: null, repo_path: tempDir() }), false);
});

test("共通は作業フォルダが Git のリポジトリの中にあっても Git の作業場所を持たない", async () => {
  const { dir } = gitRepo();
  const work = path.join(dir, ".common-work");
  fs.mkdirSync(work);
  assert.equal(await hasGitWorkplace({ kind: null, repo_path: work }), true);
  assert.equal(await hasGitWorkplace({ kind: "common", repo_path: work }), false);
});
