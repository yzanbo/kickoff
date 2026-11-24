import assert from "node:assert/strict";
import { test } from "vitest";
import { findSingleUse } from "./checks.mjs";

test("1 つの機能だけが読む土台のファイル: テストでない読み手が 1 つの機能だけなら警告。土台・組み立てが読むもの・keep は外す", () => {
  const config = { tests: ["**/*.test.ts"], singleUse: { files: ["src/foundation/ui/**"], keep: ["src/foundation/ui/kept.ts"] } };
  const graph = new Map([
    ["src/features/a/ui/x.ts", [{ path: "src/foundation/ui/one.ts" }, { path: "src/foundation/ui/two.ts" }, { path: "src/foundation/ui/kept.ts" }, { path: "src/foundation/ui/shell.ts" }]],
    ["src/features/a/ui/y.ts", [{ path: "src/foundation/ui/one.ts" }]],
    ["src/features/b/ui/z.ts", [{ path: "src/foundation/ui/two.ts" }, { module: "react" }]],
    ["src/features/b/ui/z.test.ts", [{ path: "src/foundation/ui/one.ts" }]],
    ["src/app/renderer/App.tsx", [{ path: "src/foundation/ui/shell.ts" }]],
    ["src/foundation/ui/inner.ts", [{ path: "src/foundation/ui/base.ts" }]],
    ["src/features/c/ui/w.ts", [{ path: "src/foundation/ui/base.ts" }]],
  ]);
  assert.deepEqual(findSingleUse(graph, config), [{ file: "src/foundation/ui/one.ts", feature: "a" }]);
  assert.deepEqual(findSingleUse(graph, {}), []);
});
