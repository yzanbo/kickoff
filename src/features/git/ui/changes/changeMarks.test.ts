import assert from "node:assert/strict";
import { test } from "vitest";
import { changeKinds } from "./changeMarks";

test("ファイルは未ステージ・競合を優先し、フォルダには中でいちばん目立つ記号を付ける", () => {
  const { files, folders } = changeKinds({
    repo: true,
    branch: "main",
    upstream: null,
    has_origin: false,
    ahead: 0,
    behind: 0,
    staged: [{ path: "src/a.ts", kind: "A" }],
    unstaged: [
      { path: "src/a.ts", kind: "M" },
      { path: "src/lib/new.ts", kind: "U" },
    ],
    conflicts: [{ path: "docs/x.md", kind: "!" }],
    operation: null,
  });
  assert.deepEqual(files.get("src/a.ts"), { kind: "M", label: "変更" });
  assert.equal(files.get("src/lib/new.ts")?.kind, "U");
  assert.equal(folders.get("src")?.kind, "M");
  assert.equal(folders.get("src/lib")?.kind, "U");
  assert.equal(folders.get("docs")?.kind, "!");
});
