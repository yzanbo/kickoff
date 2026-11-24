import assert from "node:assert/strict";
import { test } from "vitest";
import { copySourcesOf } from "./copySources";

test("写す元の一覧: 接続のあるプロジェクトだけを並べ、読めなかったプロジェクトは名前を返す（黙って消さない）", () => {
  const a = { id: 1, name: "A" };
  const b = { id: 2, name: "B" };
  const c = { id: 3, name: "C" };
  const sources = copySourcesOf([
    { project: a, connections: [{ id: 10 }] },
    { project: b, connections: [] },
    { project: c, connections: null },
  ]);
  assert.deepEqual(sources.groups, [{ project: a, connections: [{ id: 10 }] }]);
  assert.deepEqual(sources.failed, ["C"]);
});
