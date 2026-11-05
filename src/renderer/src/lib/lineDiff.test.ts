import assert from "node:assert/strict";
import { test } from "node:test";
import { lineCounts, lineDiff } from "./lineDiff";

const show = (before: string, after: string) => lineDiff(before, after).map((d) => `${d.kind === "same" ? " " : d.kind === "add" ? "+" : "-"}${d.text}`);

test("lineDiff: 同じ行はそのまま、変えた行は消した行 → 足した行の順", () => {
  assert.deepEqual(show("a\nb\nc\n", "a\nB\nc\nd\n"), [" a", "-b", "+B", " c", "+d"]);
});

test("lineDiff: 空の文・同じ文", () => {
  assert.deepEqual(show("", "x"), ["+x"]);
  assert.deepEqual(show("x", ""), ["-x"]);
  assert.deepEqual(show("a\nb", "a\nb\n"), [" a", " b"]);
});

test("lineDiff: 間に足した行・消した行を、共通の行を残して見つける", () => {
  assert.deepEqual(show("1\n2\n3\n4", "1\n3\nx\n4"), [" 1", "-2", " 3", "+x", " 4"]);
});

test("lineCounts: 足した行と消した行の数", () => {
  assert.deepEqual(lineCounts(lineDiff("a\nb\nc", "a\nB\nc\nd")), { added: 2, removed: 1 });
});
