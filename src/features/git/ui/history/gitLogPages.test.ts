import assert from "node:assert/strict";
import { test } from "vitest";
import type { GitCommit, GitLog } from "@shared/git/types";
import { appendPage, readLogRange, sameLogStart } from "./gitLogPages";

const commit = (hash: string, refs: string[] = []): GitCommit => ({ hash, parents: [], author: "a", email: "a@example.com", date: "2026-11-23T00:00:00Z", refs, subject: hash });
const log = (hashes: string[], more = false): GitLog => ({ commits: hashes.map((h) => commit(h)), more });

/** 2 件ずつ返す偽の git log（読んだ skip を控える） */
function pages(all: string[]) {
  const skips: number[] = [];
  const read = async (skip: number) => {
    skips.push(skip);
    return log(all.slice(skip, skip + 2), skip + 2 < all.length);
  };
  return { read, skips };
}

test("readLogRange: 読み込んだ範囲まで、先頭から 1 ページずつ読み直す", async () => {
  const { read, skips } = pages(["e", "d", "c", "b", "a"]);
  const result = await readLogRange(read, 4);
  assert.deepEqual(result.commits.map((c) => c.hash), ["e", "d", "c", "b"]);
  assert.equal(result.more, true);
  assert.deepEqual(skips, [0, 2]);
});

test("readLogRange: 範囲が 0 なら 1 ページ。続きがなければ範囲の途中でやめる", async () => {
  assert.deepEqual((await readLogRange(pages(["c", "b", "a"]).read, 0)).commits.map((c) => c.hash), ["c", "b"]);
  const short = pages(["b", "a"]);
  const result = await readLogRange(short.read, 6);
  assert.deepEqual(result.commits.map((c) => c.hash), ["b", "a"]);
  assert.equal(result.more, false);
  assert.deepEqual(short.skips, [0]);
});

test("appendPage: 読み始めたときの一覧のままなら、続きを足す", () => {
  const base = log(["d", "c"], true);
  const next = appendPage(base, base, log(["b", "a"]));
  assert.deepEqual(next.commits.map((c) => c.hash), ["d", "c", "b", "a"]);
  assert.equal(next.more, false);
});

test("appendPage: 続きを読む間に取り直しが先に返って一覧が変わったら、古い位置からの続きは足さない", () => {
  const base = log(["d", "c"], true);
  // 新しいコミット e ができて、取り直した一覧の先頭がずれた
  const refetched = log(["e", "d"], true);
  // 古い位置（skip 2）から読んだ続きは c と重なる・b が抜ける
  assert.equal(appendPage(refetched, base, log(["b", "a"])), refetched);
});

test("sameLogStart: 取り直した一覧が前の一覧の先頭と同じ（印も）なら同じ", () => {
  const prev = log(["d", "c", "b", "a"]);
  assert.equal(sameLogStart(prev, log(["d", "c"], true)), true);
  assert.equal(sameLogStart(prev, log(["e", "d"], true)), false);
  assert.equal(sameLogStart(prev, { commits: [commit("d", ["HEAD -> main"]), commit("c")], more: true }), false);
});
