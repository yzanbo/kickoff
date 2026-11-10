import assert from "node:assert/strict";
import test from "node:test";
import { parseBlame } from "./blame.js";

const A = "a".repeat(40);
const Z = "0".repeat(40);

test("parseBlame: 行ごとのコミットを読み、同じコミットの 2 つ目からは省かれた見出しを初めのものから使う。まだコミットしていない行と自分の印", () => {
  const out = [
    `${A} 1 1 2`,
    "author 山田",
    "author-mail <Yamada@Example.com>",
    "author-time 1700000000",
    "author-tz +0900",
    "summary 最初のコミット",
    "filename a.txt",
    "\tone",
    `${A} 2 2`,
    "\ttwo",
    `${Z} 3 3 1`,
    "author Not Committed Yet",
    "author-mail <not.committed.yet>",
    "author-time 1700000100",
    "summary Version of a.txt from a.txt",
    "filename a.txt",
    "\tthree",
    "",
  ].join("\n");
  const blame = parseBlame(out, "yamada@example.com");
  assert.deepEqual(blame.lines, [0, 0, 1]);
  assert.equal(blame.commits.length, 2);
  assert.deepEqual(blame.commits[0], { hash: A, author: "山田", email: "Yamada@Example.com", date: new Date(1700000000 * 1000).toISOString(), summary: "最初のコミット", uncommitted: false, you: true });
  assert.equal(blame.commits[1].uncommitted, true);
  assert.equal(blame.commits[1].you, true);
  // 自分のメールが分からなければ、自分の印はまだコミットしていない行だけ
  assert.equal(parseBlame(out, "").commits[0].you, false);
});
