import assert from "node:assert/strict";
import { test } from "node:test";
import { quickDiff } from "./quickDiff";

const text = (...lines: string[]) => lines.join("\n");

test("quickDiff: 同じ中身なら違いはない", () => {
  assert.deepEqual(quickDiff(text("a", "b"), text("a", "b")), []);
});

test("quickDiff: 足した行は added（いまの中身の行で返す）", () => {
  assert.deepEqual(quickDiff(text("a", "b"), text("a", "x", "y", "b")), [{ kind: "added", start: 2, end: 3 }]);
  assert.deepEqual(quickDiff(text("a"), text("a", "b")), [{ kind: "added", start: 2, end: 2 }]);
});

test("quickDiff: 書き換えた行は modified", () => {
  assert.deepEqual(quickDiff(text("a", "b", "c"), text("a", "B", "c")), [{ kind: "modified", start: 2, end: 2 }]);
  // 2 行を 3 行に書き換えても、いまの中身の 3 行を変更にする
  assert.deepEqual(quickDiff(text("a", "b", "c", "d"), text("a", "x", "y", "z", "d")), [{ kind: "modified", start: 2, end: 4 }]);
});

test("quickDiff: 消した行は deleted（消した所の直前の行。先頭なら 0）", () => {
  assert.deepEqual(quickDiff(text("a", "b", "c"), text("a", "c")), [{ kind: "deleted", start: 1, end: 1 }]);
  assert.deepEqual(quickDiff(text("a", "b", "c"), text("b", "c")), [{ kind: "deleted", start: 0, end: 0 }]);
  assert.deepEqual(quickDiff(text("a", "b", "c"), text("a", "b")), [{ kind: "deleted", start: 2, end: 2 }]);
});

test("quickDiff: 離れた違いは別のかたまりにして、行の順に並べる", () => {
  assert.deepEqual(quickDiff(text("a", "b", "c", "d", "e", "f"), text("a", "B", "c", "d", "f", "g")), [
    { kind: "modified", start: 2, end: 2 },
    { kind: "deleted", start: 4, end: 4 },
    { kind: "added", start: 6, end: 6 },
  ]);
});

test("quickDiff: 元が空（新しいファイル）なら全部が足した行、全部消したら先頭の deleted", () => {
  assert.deepEqual(quickDiff("", text("a", "b")), [{ kind: "added", start: 1, end: 2 }]);
  assert.deepEqual(quickDiff(text("a", "b", ""), ""), [{ kind: "deleted", start: 0, end: 0 }]);
});

test("quickDiff: 違いが多すぎても固まらず、違う所をまとめて 1 つの変更にする", () => {
  const base = Array.from({ length: 2000 }, (_, i) => `a${i}`);
  const current = Array.from({ length: 2000 }, (_, i) => `b${i}`);
  assert.deepEqual(quickDiff(text("head", ...base, "tail"), text("head", ...current, "tail")), [{ kind: "modified", start: 2, end: 2001 }]);
});

test("quickDiff: 改行の CRLF は LF と同じに数える", () => {
  assert.deepEqual(quickDiff("a\r\nb\r\n", "a\nb\n"), []);
});
