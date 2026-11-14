import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleChangePaths } from "./useChangeSelection";

const paths = ["src/b.ts", "src/a/x.ts", "README.md"];

test("visibleChangePaths: 一覧の表示ならそのままの並び、閉じたまとまりは空", () => {
  assert.deepEqual(visibleChangePaths(paths, { open: true, closed: new Set() }, false), paths);
  assert.deepEqual(visibleChangePaths(paths, { open: false, closed: new Set() }, false), []);
});

test("visibleChangePaths: 木の表示ならフォルダを除いた木の順で、閉じたフォルダの中は入れない", () => {
  assert.deepEqual(visibleChangePaths(paths, { open: true, closed: new Set() }, true), ["src/a/x.ts", "src/b.ts", "README.md"]);
  assert.deepEqual(visibleChangePaths(paths, { open: true, closed: new Set(["src/a"]) }, true), ["src/b.ts", "README.md"]);
});
