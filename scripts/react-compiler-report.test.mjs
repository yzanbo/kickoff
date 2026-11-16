import assert from "node:assert/strict";
import { test } from "vitest";
import { functionNameAt, recordOf, reportLines, summarize } from "./react-compiler-report.mjs";

const loc = (line, column = 0) => ({ start: { line, column }, end: { line, column } });

test("関数の始まりの行から名前を拾う", () => {
  assert.equal(functionNameAt("export function ChatPane({ chatId }: Props) {", 7), "ChatPane");
  assert.equal(functionNameAt("export default async function load() {", 15), "load");
  assert.equal(functionNameAt("export const useFoo = (id: number) => {", 22), "useFoo");
  assert.equal(functionNameAt("const Row = memo(function Row({ item }) {", 17), "Row");
  assert.equal(functionNameAt("const Row = memo((props: Props) => {", 17), "Row");
  assert.equal(functionNameAt("const handlers: Handlers = useMemo(() => ({", 35), "handlers");
  assert.equal(functionNameAt("  items.map((x) => {", 12), null);
});

test("知らせを記録に直す（名前のない外れは行の文字から、最適化は知らせの名前から）", () => {
  const line = "export function Foo() {";
  assert.deepEqual(recordOf("a.tsx", { kind: "CompileSuccess", fnLoc: loc(3), fnName: "Foo" }, line), {
    file: "a.tsx",
    fn: "Foo",
    line: 3,
    compiled: true,
    reason: null,
    at: null,
  });
  const detail = { category: "Refs", reason: "Cannot access refs during render", primaryLocation: () => loc(9) };
  assert.deepEqual(recordOf("a.tsx", { kind: "CompileError", fnLoc: loc(3, 7), detail }, line), {
    file: "a.tsx",
    fn: "Foo",
    line: 3,
    compiled: false,
    reason: "Refs: Cannot access refs during render",
    at: 9,
  });
  assert.equal(recordOf("a.tsx", { kind: "CompileSkip", fnLoc: loc(3, 7), reason: "Skipped due to 'use no memo' directive.", loc: loc(4) }, line).at, 4);
  // 関数の外の知らせ（fnLoc がない）と、報告に使わない知らせは捨てる
  assert.equal(recordOf("a.tsx", { kind: "CompileError", fnLoc: null, detail }, line), null);
  assert.equal(recordOf("a.tsx", { kind: "Timing", fnLoc: loc(1) }, line), null);
  // 名前が読めなければ行で呼ぶ
  assert.equal(recordOf("a.tsx", { kind: "CompileError", fnLoc: loc(5, 2), detail }, "  [].map(() => {").fn, "<無名>@5");
});

test("数にまとめ、許した一覧の外れと、もう外れていない一覧の項目を出す", () => {
  const records = [
    { file: "a.tsx", fn: "A", line: 1, compiled: true, reason: null, at: null },
    { file: "a.tsx", fn: "B", line: 10, compiled: false, reason: "Refs: x", at: 12 },
    { file: "a.tsx", fn: "B", line: 10, compiled: false, reason: "Refs: x", at: 14 },
    { file: "b.tsx", fn: "C", line: 2, compiled: false, reason: "Todo: y", at: 3 },
    // 同じ関数に最適化と外れの両方があれば、最適化したとみなす
    { file: "b.tsx", fn: "D", line: 8, compiled: false, reason: "Refs: x", at: 9 },
    { file: "b.tsx", fn: "D", line: 8, compiled: true, reason: null, at: null },
  ];
  const summary = summarize(records, { "b.tsx:C": "未対応の書き方", "c.tsx:E": "直した" });
  assert.equal(summary.compiled, 2);
  assert.deepEqual(summary.skipped, [
    { key: "a.tsx:B", line: 10, reasons: ["Refs: x"], at: [12, 14] },
    { key: "b.tsx:C", line: 2, reasons: ["Todo: y"], at: [3] },
  ]);
  assert.deepEqual(summary.byReason, { "Refs: x": 1, "Todo: y": 1 });
  assert.deepEqual(summary.unexpected, ["a.tsx:B"]);
  assert.deepEqual(summary.stale, ["c.tsx:E"]);
  assert.deepEqual(reportLines(summary), [
    "React Compiler: 最適化した部品・hooks 2・外した 2",
    "  1 Refs: x",
    "  1 Todo: y",
    "  許した一覧にあるが外れていない（一覧から消す）: c.tsx:E",
  ]);
});
