// gh api の口（偽の gh で、答えの形の扱いを確かめる）
import assert from "node:assert/strict";
import { test } from "vitest";
import { Invalid } from "@/foundation/core/errors";
import { ghApi } from "./ghApi";
import { fakeGh } from "./testing/fakeGh";

test("続きのページ: 答えが配列でなければ（エラーの本文など）分かる文の Invalid で止める", async () => {
  fakeGh([['"api repos/o/r/pulls/1/files"*', '{"message":"Not Found"}']]);
  await assert.rejects(ghApi("o/r").restPages("repos/o/r/pulls/1/files", 3), (e: unknown) => e instanceof Invalid && /一覧ではありません/.test(e.message));
});

test("続きのページ: 100 件に満たないページで終わる", async () => {
  const calls = fakeGh([['"api repos/o/r/pulls/1/files"*', "[1,2]"]]);
  assert.deepEqual(await ghApi("o/r").restPages("repos/o/r/pulls/1/files", 3), { items: [1, 2], truncated: false });
  assert.deepEqual(calls(), ["api repos/o/r/pulls/1/files?per_page=100&page=1"]);
});
