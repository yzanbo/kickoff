import assert from "node:assert/strict";
import { test } from "vitest";
import { HOME_FOLDER, expandHomeWith } from "@shared/foundation/path";
import { makeProject } from "@shared/projects/testing";
import { terminalFolderOf } from "./folder";

test("terminalFolderOf: プロジェクトは本体、共通は作業フォルダでなくホームフォルダの印（展開するとホーム）", () => {
  assert.equal(terminalFolderOf(makeProject(1)), "/repo/p1");
  const common = makeProject(9, { kind: "common", repo_path: "/notes/.common-work" });
  assert.equal(terminalFolderOf(common), HOME_FOLDER);
  assert.equal(expandHomeWith(terminalFolderOf(common), "/Users/me"), "/Users/me");
});
