import assert from "node:assert/strict";
import { test } from "node:test";
import { outputLanguage, parseNumberedLines, parseSearchLines, searchRuns } from "./toolResultParse";

test("parseNumberedLines: 「番号\\t中身」と以前の「番号→中身」を読み、番号のない行があれば null", () => {
  assert.deepEqual(parseNumberedLines("1\t# 見出し\n2\t\n3\tconst a = 1;\n"), [
    { no: 1, text: "# 見出し" },
    { no: 2, text: "" },
    { no: 3, text: "const a = 1;" },
  ]);
  assert.deepEqual(parseNumberedLines("    10→a\n    11→\tb"), [
    { no: 10, text: "a" },
    { no: 11, text: "\tb" },
  ]);
  assert.equal(parseNumberedLines("[image]"), null);
  assert.equal(parseNumberedLines("1\ta\nFile truncated"), null);
});

test("parseSearchLines: content は「パス:行:中身」と文脈の「パス-行-中身」・パスのない形、区切りと件数の知らせは note", () => {
  assert.deepEqual(parseSearchLines("src/a-b.ts:12:const x = 1;\nsrc/a-b.ts-13-// next\n--\nsrc/c.ts:3:y", "content"), [
    { kind: "match", path: "src/a-b.ts", no: 12, text: "const x = 1;" },
    { kind: "context", path: "src/a-b.ts", no: 13, text: "// next" },
    { kind: "note", text: "--" },
    { kind: "match", path: "src/c.ts", no: 3, text: "y" },
  ]);
  assert.deepEqual(parseSearchLines("4:foo: bar\n5-baz", "content"), [
    { kind: "match", path: null, no: 4, text: "foo: bar" },
    { kind: "context", path: null, no: 5, text: "baz" },
  ]);
});

test("parseSearchLines: ファイルの一覧（Glob も）と件数", () => {
  assert.deepEqual(parseSearchLines("Found 2 files\nsrc/a.ts\nsrc/b.css", undefined), [
    { kind: "note", text: "Found 2 files" },
    { kind: "path", path: "src/a.ts", count: null },
    { kind: "path", path: "src/b.css", count: null },
  ]);
  assert.deepEqual(parseSearchLines("src/a.ts:4", "count"), [{ kind: "path", path: "src/a.ts", count: 4 }]);
});

test("searchRuns: 同じファイルの続いた行を 1 つにまとめ、そのファイルの言語を付ける（パスのない行は探した場所の言語）", () => {
  const runs = searchRuns(parseSearchLines("a.ts:1:x\na.ts-2-y\n--\nb.css:3:z", "content"), undefined);
  assert.deepEqual(
    runs.map((r) => [r.lang, r.lines.length]),
    [
      ["typescript", 2],
      [undefined, 1],
      ["css", 1],
    ],
  );
  assert.equal(searchRuns(parseSearchLines("1:x\n2:y", "content"), "src/a.py")[0].lang, "python");
});

test("outputLanguage: JSON・差分・ファイルの中身を出すだけのコマンドはその言語、ほかはログ", () => {
  assert.equal(outputLanguage("curl -s localhost/api", '{"a": 1}\n'), "json");
  assert.equal(outputLanguage("echo [x", "[x"), "log");
  assert.equal(outputLanguage("git diff --stat", " a.ts | 2 +-"), "diff");
  assert.equal(outputLanguage("git log -3 -p", "commit 1"), "diff");
  assert.equal(outputLanguage("some-tool", "diff --git a/x b/x\n"), "diff");
  assert.equal(outputLanguage("cat src/a.ts", "const a = 1;"), "typescript");
  assert.equal(outputLanguage("head -n 40 'src/My File.py'", "x = 1"), "python");
  assert.equal(outputLanguage("sed -n '1,20p' styles/a.css", ".a {}"), "css");
  assert.equal(outputLanguage("cat a.ts | grep x", "x"), "log");
  assert.equal(outputLanguage("cat a.ts b.ts", "x"), "log");
  assert.equal(outputLanguage("npm test", "ok 1"), "log");
});
