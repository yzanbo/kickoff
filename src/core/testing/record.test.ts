import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maskVolatile, shapeOf } from "./record.js";

test("maskVolatile: 時刻・UUID・鍵らしい並びを伏せ、ふつうの言葉と数は残す", () => {
  const value = {
    at: "2026-11-19T01:02:03.456Z",
    plain: "2026-11-19T01:02:03Z に作った",
    id: "123e4567-e89b-12d3-a456-426614174000",
    key: "Bearer abcDEF0123456789abcdef0123",
    words: "chat_events_deleted_and_more_words",
    count: 42,
    flag: true,
    none: null,
  };
  assert.deepEqual(maskVolatile(value), {
    at: "<TIME>",
    plain: "<TIME> に作った",
    id: "<UUID>",
    key: "Bearer <KEY>",
    words: "chat_events_deleted_and_more_words",
    count: 42,
    flag: true,
    none: null,
  });
});

test("maskVolatile: 一時フォルダは、その中の最初のフォルダ（毎回違う名前）ごと <TMP> にする。リンクを解いたパスも同じ", () => {
  const made = path.join(os.tmpdir(), "kickoff-test-AbC123", "repo", "a.txt");
  const real = path.join(fs.realpathSync(os.tmpdir()), "kickoff-test-XyZ789", "repo");
  assert.deepEqual(maskVolatile([made, `cd ${real} && ls`, os.tmpdir()]), ["<TMP>/repo/a.txt", "cd <TMP>/repo && ls", "<TMP>"]);
});

test("maskVolatile: paths で渡したパスは名前にする（長いパスから当てる）", () => {
  const repo = "/work/project";
  const worktree = "/work/project-worktrees/feat";
  const out = maskVolatile({ cwd: `${worktree}/src`, repo, nested: [{ p: `${repo}/a` }] }, { paths: { REPO: repo, WT: worktree } });
  assert.deepEqual(out, { cwd: "<WT>/src", repo: "<REPO>", nested: [{ p: "<REPO>/a" }] });
});

test("shapeOf: 値を型の名前にし、オブジェクトのキーを並べ替える", () => {
  assert.deepEqual(shapeOf({ b: 1, a: "x", c: null, d: false }), { a: "string", b: "number", c: "null", d: "boolean" });
  assert.equal(JSON.stringify(Object.keys(shapeOf({ z: 1, a: 1, m: 1 }) as object)), '["a","m","z"]');
});

test("shapeOf: 配列は要素の形を重ねた 1 要素の配列、空なら []", () => {
  assert.deepEqual(shapeOf([]), []);
  assert.deepEqual(shapeOf([1, 2, 3]), ["number"]);
  assert.deepEqual(shapeOf({ list: [[], []] }), { list: [[]] });
  assert.deepEqual(shapeOf([[], [1]]), [["number"]]);
});

test("shapeOf: 同じ場所で形が違う値は A | B、いくつかの要素にしかないキーは「?」", () => {
  assert.deepEqual(shapeOf([{ id: 1, name: "a" }, { id: 2, name: null, extra: true }]), [{ "extra?": "boolean", id: "number", name: "null | string" }]);
  assert.deepEqual(shapeOf([1, "a", 2]), ["number | string"]);
  // 種類の違う形（オブジェクトと null）は、オブジェクトを JSON の文字にして並べる
  assert.deepEqual(shapeOf([{ live: null }, { live: { phase: "x" } }]), [{ live: 'null | {"phase":"string"}' }]);
});

test("shapeOf: 要素の並びが変わっても同じ形になる", () => {
  const items = [{ a: 1 }, null, { a: "x", b: [1] }, { a: 2, b: [] }];
  assert.deepEqual(shapeOf(items), shapeOf([...items].reverse()));
});
