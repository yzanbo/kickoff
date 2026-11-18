import assert from "node:assert/strict";
import { test } from "vitest";
import {
  baselineFrom,
  buildGraph,
  checkCssClasses,
  checkFileSizes,
  checkImports,
  checkNativeAccess,
  checkPatterns,
  checkPlacement,
  checkPublicApi,
  checkSqlTables,
  compareWithBaseline,
  countLines,
  cssClassesIn,
  findSiblingCycles,
  globToRegExp,
  parseImports,
  resolveSpecifier,
  sqlTablesIn,
} from "./check-structure.mjs";

test("glob: ** は 0 個以上のフォルダ、* は / をまたがない、{a,b} と ? も使える", () => {
  const ts = globToRegExp("src/**/*.ts");
  assert.ok(ts.test("src/a.ts"));
  assert.ok(ts.test("src/x/y/a.ts"));
  assert.ok(!ts.test("src/a.tsx"));
  assert.ok(globToRegExp("src/**/*.{ts,tsx}").test("src/x/a.tsx"));
  assert.ok(!globToRegExp("src/*.ts").test("src/x/a.ts"));
  assert.ok(globToRegExp("src/core/**").test("src/core/x/y.ts"));
  assert.ok(globToRegExp("**/testing/**").test("src/core/testing/a.ts"));
  assert.ok(globToRegExp("a?.ts").test("ab.ts"));
  assert.ok(!globToRegExp("a?.ts").test("a/.ts"));
  assert.ok(!globToRegExp("src/a.ts").test("src/aXts"));
});

test("import を読む: 静的・型だけ・export from・動的。文字とコメントの中は拾わない", () => {
  const source = [
    'import a from "./a";',
    'import type { B } from "./b";',
    'import { type C } from "./c";',
    'import { type D, e } from "./d";',
    'import "./side.css";',
    'export { f } from "./f";',
    'export * from "./g";',
    'export type { H } from "./h";',
    "// 日本語のコメント: import x from \"./comment\"",
    'const s = \'import y from "./string"\';',
    "/* export { z } from \"./block\" */",
    'const m = await import("./dyn");',
    "const t = await import(`./tmpl`);",
    "const u = await import(name);",
  ].join("\n");
  assert.deepEqual(parseImports("x.ts", source), [
    { specifier: "./a", typeOnly: false, dynamic: false },
    { specifier: "./b", typeOnly: true, dynamic: false },
    { specifier: "./c", typeOnly: true, dynamic: false },
    { specifier: "./d", typeOnly: false, dynamic: false },
    { specifier: "./side.css", typeOnly: false, dynamic: false },
    { specifier: "./f", typeOnly: false, dynamic: false },
    { specifier: "./g", typeOnly: false, dynamic: false },
    { specifier: "./h", typeOnly: true, dynamic: false },
    { specifier: "./dyn", typeOnly: false, dynamic: true },
    { specifier: "./tmpl", typeOnly: false, dynamic: true },
  ]);
  assert.throws(() => parseImports("bad.ts", "import {"), /bad\.ts/);
});

test("行き先を解く: 拡張子・index・別名・? の後ろ・パッケージ", () => {
  const files = new Set(["src/core/a.ts", "src/core/dir/index.ts", "src/shared/x.ts", "src/renderer/src/x.tsx", "src/core/w.ts", "src/core/s.css"]);
  const ctx = { aliases: { "@shared/": "src/shared/", "@/": "src/renderer/src/" }, files };
  const from = "src/core/main.ts";
  assert.deepEqual(resolveSpecifier(from, "./a.js", ctx), { path: "src/core/a.ts" });
  assert.deepEqual(resolveSpecifier(from, "./dir", ctx), { path: "src/core/dir/index.ts" });
  assert.deepEqual(resolveSpecifier(from, "@shared/x", ctx), { path: "src/shared/x.ts" });
  assert.deepEqual(resolveSpecifier(from, "@/x", ctx), { path: "src/renderer/src/x.tsx" });
  assert.deepEqual(resolveSpecifier(from, "./w?worker", ctx), { path: "src/core/w.ts" });
  assert.deepEqual(resolveSpecifier(from, "./s.css?raw", ctx), { path: "src/core/s.css" });
  assert.deepEqual(resolveSpecifier("src/core/x/y.ts", "../a.js", ctx), { path: "src/core/a.ts" });
  assert.deepEqual(resolveSpecifier(from, "node:fs", ctx), { module: "node:fs" });
  assert.deepEqual(resolveSpecifier(from, "@scope/pkg/sub", ctx), { module: "@scope/pkg" });
  assert.deepEqual(resolveSpecifier(from, "pkg/sub/x.js", ctx), { module: "pkg" });
  assert.deepEqual(resolveSpecifier(from, "../../node_modules/monaco-editor/esm/x.js", ctx), { module: "monaco-editor" });
  assert.deepEqual(resolveSpecifier(from, "./made.generated", ctx), { module: "src/core/made.generated" });
});

test("グラフ: 同じ行き先は 1 本にまとめ、値も読むなら型だけにしない", () => {
  const sources = new Map([
    ["src/a.ts", 'import type { X } from "./b";\nimport { y } from "./b.js";\nimport type { Z } from "./c";'],
    ["src/b.ts", ""],
    ["src/c.ts", ""],
    ["src/s.css", ".a {}"],
  ]);
  const graph = buildGraph(sources, { aliases: {} });
  assert.deepEqual(graph.get("src/a.ts"), [
    { path: "src/b.ts", typeOnly: false },
    { path: "src/c.ts", typeOnly: true },
  ]);
  assert.equal(graph.has("src/s.css"), false);
});

/** テストのための小さなグラフ（読む側 → 行き先） */
function graphOf(entries) {
  return new Map(entries.map(([file, edges]) => [file, edges.map((e) => (typeof e === "string" ? { ...(e.includes("/") ? { path: e } : { module: e }), typeOnly: false } : e))]));
}

const layerConfig = {
  tests: ["**/*.test.ts"],
  layers: { core: ["src/core/**"], renderer: ["src/renderer/**"], shared: ["src/shared/**"] },
};

test("import の向き: deny・allow・allowModules・denyModules・tests・typeOnlyAllowed", () => {
  const graph = graphOf([
    ["src/core/a.ts", ["src/renderer/x.ts", "src/shared/s.ts", "node:fs"]],
    ["src/shared/s.ts", ["src/shared/t.ts", "src/core/a.ts", "zod", { path: "src/core/types.ts", typeOnly: true }]],
    ["src/shared/s.test.ts", ["src/core/a.ts"]],
    ["src/renderer/r.ts", ["node:path", "react", { path: "src/core/types.ts", typeOnly: true }]],
  ]);
  const config = {
    ...layerConfig,
    imports: [
      { name: "core-not-renderer", from: ["core"], deny: ["renderer"], message: "画面を読まない" },
      { name: "shared-pure", from: ["shared"], tests: "exclude", allow: ["shared"], allowModules: [], message: "shared だけ" },
      { name: "renderer-not-node", from: ["renderer"], denyModules: ["node:*"], message: "node: を読まない" },
      { name: "renderer-types", from: ["renderer"], deny: ["core"], typeOnlyAllowed: true, message: "型だけならよい" },
    ],
  };
  assert.deepEqual(
    checkImports(graph, config).map((v) => v.key),
    [
      "import:core-not-renderer:src/core/a.ts -> src/renderer/x.ts",
      "import:shared-pure:src/shared/s.ts -> src/core/a.ts",
      "import:shared-pure:src/shared/s.ts -> zod",
      "import:shared-pure:src/shared/s.ts -> src/core/types.ts",
      "import:renderer-not-node:src/renderer/r.ts -> node:path",
    ],
  );
  const [first] = checkImports(graph, config);
  assert.equal(first.kind, "import");
  assert.equal(first.message, "src/core/a.ts: 画面を読まない");
});

test("import の向き: tests を書かなければテストも見る", () => {
  const graph = graphOf([["src/shared/s.test.ts", ["src/core/a.ts"]]]);
  const config = { ...layerConfig, imports: [{ name: "x", from: ["shared"], allow: ["shared"], message: "m" }] };
  assert.deepEqual(
    checkImports(graph, config).map((v) => v.key),
    ["import:x:src/shared/s.test.ts -> src/core/a.ts"],
  );
});

test("ファイルの大きさ: 上から最初に合った決まりの上限、なければ既定", () => {
  const config = {
    fileSize: {
      limit: 300,
      rules: [
        { glob: "src/types/**", limit: 500 },
        { glob: "**/*.test.ts", limit: 400 },
        { glob: "src/types/**/*.test.ts", limit: 10 },
      ],
      files: ["src/**/*.ts"],
    },
  };
  const counts = new Map([
    ["src/a.ts", 301],
    ["src/b.ts", 300],
    ["src/types/t.ts", 450],
    ["src/types/u.test.ts", 450],
    ["src/c.test.ts", 401],
    ["other/d.ts", 999],
  ]);
  assert.deepEqual(
    checkFileSizes(counts, config).map((v) => [v.key, v.value]),
    [
      ["size:src/a.ts", 301],
      ["size:src/c.test.ts", 401],
    ],
  );
});

test("行の数は、最後の改行のあとを数えない", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\nb"), 2);
});

const imp = (key) => ({ kind: "import", key: `import:${key}`, message: key });
const size = (file, value) => ({ kind: "size", key: `size:${file}`, value, message: file });

test("基準線と比べる: 新しい違反・直ったのに残る・増えた・減った（通す）", () => {
  const baseline = baselineFrom([imp("r:a -> b"), imp("r:c -> d"), size("big.ts", 500), size("fixed.ts", 400), size("less.ts", 450)]);
  assert.deepEqual(baseline.violations.import, ["r:a -> b", "r:c -> d"]);
  assert.deepEqual(baseline.violations.size, { "big.ts": 500, "fixed.ts": 400, "less.ts": 450 });
  const now = [imp("r:a -> b"), imp("r:e -> f"), size("big.ts", 520), size("less.ts", 420), size("new.ts", 310)];
  const result = compareWithBaseline(now, baseline);
  assert.deepEqual(
    result.added.map((v) => v.key),
    ["import:r:e -> f", "size:new.ts"],
  );
  assert.deepEqual(result.stale, ["import:r:c -> d", "size:fixed.ts"]);
  assert.deepEqual(result.grown, [{ key: "size:big.ts", from: 500, to: 520 }]);
  assert.deepEqual(result.shrunk, [{ key: "size:less.ts", from: 450, to: 420 }]);
});

test("基準線と比べる: 基準線がなければ、いまの違反が全部新しい", () => {
  const result = compareWithBaseline([imp("r:a -> b")], { version: 1, violations: {} });
  assert.equal(result.added.length, 1);
  assert.deepEqual(result.stale, []);
});

const keys = (violations) => violations.map((v) => v.key);

test("公開の口: 外からは entry だけ。中どうしと except は見ない", () => {
  const graph = graphOf([
    ["src/features/board/core/x.ts", ["src/features/chat/core/index.ts", "src/features/chat/core/inner.ts", "src/features/chat/core/run/deep.ts", "zod"]],
    ["src/features/chat/core/run/a.ts", ["src/features/chat/core/inner.ts"]],
    ["src/app/core/start.ts", ["src/features/chat/core/inner.ts"]],
  ]);
  const config = { publicApi: [{ name: "feature-core", dirs: "src/features/*/core", entry: ["index.ts"], except: ["src/app/**"] }] };
  assert.deepEqual(keys(checkPublicApi(graph, config)), [
    "public:feature-core:src/features/board/core/x.ts -> src/features/chat/core/inner.ts",
    "public:feature-core:src/features/board/core/x.ts -> src/features/chat/core/run/deep.ts",
  ]);
});

test("兄弟の循環: 読み合うフォルダを 1 つの成分にし、3 つの輪も 1 つ。自分の中・直下のファイル・テストは辺にしない", () => {
  const graph = graphOf([
    ["src/f/a/x.ts", ["src/f/b/y.ts", "src/f/a/z.ts"]],
    ["src/f/b/y.ts", ["src/f/a/x.ts"]],
    ["src/f/c/x.ts", ["src/f/d/x.ts"]],
    ["src/f/d/x.ts", ["src/f/e/x.ts", "src/f/root.ts"]],
    ["src/f/e/x.ts", ["src/f/c/x.ts"]],
    ["src/f/root.ts", ["src/f/g/x.ts"]],
    ["src/f/g/x.ts", ["src/f/h/x.ts"]],
    ["src/f/h/x.test.ts", ["src/f/g/x.ts"]],
  ]);
  const config = { tests: ["**/*.test.ts"], siblingCycles: [{ name: "f", parents: ["src/f"], tests: "exclude" }] };
  assert.deepEqual(keys(findSiblingCycles(graph, config)), ["cycle:f:src/f:a,b", "cycle:f:src/f:c,d,e"]);
  const nested = { siblingCycles: [{ name: "ui", parents: ["src/*"] }] };
  assert.deepEqual(keys(findSiblingCycles(graph, nested)), ["cycle:ui:src/f:a,b", "cycle:ui:src/f:c,d,e", "cycle:ui:src/f:g,h"]);
});

test("window.kickoff: allow の外で書いたファイル。コメントの行は数えない", () => {
  const sources = new Map([
    ["src/r/a.ts", "const x = window.kickoff.getInfo();"],
    ["src/r/b.ts", "globalThis.kickoff?.quit();"],
    ["src/r/c.ts", "// window.kickoff は native.ts から\n/* globalThis.kickoff */\n * window.kickoff"],
    ["src/r/native.ts", "window.kickoff.quit();"],
    ["src/other.ts", "window.kickoff.quit();"],
  ]);
  const config = { nativeAccess: { files: ["src/r/**"], allow: ["src/r/native.ts"] } };
  assert.deepEqual(keys(checkNativeAccess(sources, config)), ["native:src/r/a.ts", "native:src/r/b.ts"]);
});

test("SQL の表を拾う: FROM・JOIN・INSERT INTO・CREATE TABLE・テンプレート文字。コメントとふつうの文は拾わない", () => {
  const source = [
    'const a = "SELECT c.id FROM chats c JOIN chat_events e ON e.chat_id = c.id";',
    'const b = "INSERT INTO projects (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name = excluded.name";',
    'const c = "CREATE TABLE IF NOT EXISTS groups (id INTEGER)";',
    "const d = `UPDATE snippets SET body = ? WHERE id = ${id}`;",
    'const e = "DELETE FROM secrets WHERE project_id = ?";',
    "// SELECT * FROM comment_table",
    'const f = "Copy the text from clipboard into the editor";',
  ].join("\n");
  assert.deepEqual(sqlTablesIn("x.ts", source).sort(), ["chat_events", "chats", "groups", "projects", "secrets", "snippets"]);
});

test("SQL の表の持ち主: 持ち主の外で書けば違反。ignoreNames は表にしない", () => {
  const sources = new Map([
    ["src/core/chats/store.ts", 'db.prepare("SELECT * FROM chats");'],
    ["src/core/board/list.ts", 'db.prepare("SELECT * FROM chats JOIN groups");'],
    ["src/core/projects/trigger.ts", 'db.exec("DELETE FROM drop_secrets");'],
  ]);
  const config = {
    sqlTables: { files: ["src/core/**"], owners: { chats: ["src/core/chats/**"], groups: ["src/core/board/**"], drop_secrets: ["src/core/x/**"] }, ignoreNames: ["drop_secrets"] },
  };
  assert.deepEqual(keys(checkSqlTables(sources, config)), ["sql:src/core/board/list.ts:chats"]);
});

test("CSS のクラスを拾う: 子孫・:hover・:not()・@media の中。コメント・文字・url()・宣言の値は拾わない", () => {
  const css = [
    "/* .commented { } */",
    ".chat-row:hover .x, .chat-row.is-open { color: red; margin: .5rem; }",
    "@media (max-width: 600px) { .a:not(.b) > .c { background: url(./img.d.png); } }",
    '.e::before { content: ".f"; }',
  ].join("\n");
  assert.deepEqual(cssClassesIn(css), ["chat-row", "x", "is-open", "a", "b", "c", "e"]);
});

test("CSS のクラスの持ち主: いちばん長い頭の持ち主だけ。頭のないクラスは free の CSS だけ", () => {
  const sources = new Map([
    ["src/chat/a.css", ".chat-row {} .chat-list-row {} .btn {}"],
    ["src/list/b.css", ".chat-list-row {}"],
    ["src/ui/c.css", ".btn {} .chat-row {}"],
  ]);
  const config = {
    cssClasses: {
      files: ["src/**/*.css"],
      owners: [
        { prefix: "chat-", owner: ["src/chat/**"] },
        { prefix: "chat-list-", owner: ["src/list/**"] },
      ],
      free: ["src/ui/**"],
    },
  };
  assert.deepEqual(keys(checkCssClasses(sources, config)), ["css:src/chat/a.css:chat-list-row", "css:src/chat/a.css:btn", "css:src/ui/c.css:chat-row"]);
});

test("禁じる書き方: 呼び出し・参照・引数なしの new を数える。コメント・文字・allow・テストは数えない", () => {
  const code = [
    "const a = Date.now();",
    "const b = new Date();",
    "const c = new Date(a);",
    "setTimeout(() => {}, 0);",
    "timers.setTimeout(() => {}, 0);",
    "const f = Date.now;",
    "// Date.now() と setTimeout() は書かない",
    'const s = "new Date() setTimeout()";',
  ].join("\n");
  const sources = new Map([
    ["src/core/a.ts", code],
    ["src/core/clock.ts", code],
    ["src/core/a.test.ts", code],
  ]);
  const forbid = [{ call: "setTimeout" }, { member: "Date.now" }, { new: "Date", args: 0 }];
  const config = { tests: ["**/*.test.ts"], patterns: [{ name: "no-raw-clock", files: ["src/core/**"], allow: ["src/core/clock.ts"], forbid, message: "時計は k.clock を通す" }] };
  const found = checkPatterns(sources, config);
  assert.deepEqual(
    found.map((v) => [v.key, v.value]),
    [["pattern:no-raw-clock:src/core/a.ts", 4]],
  );
});

test("置かないファイル: deny に合うファイル（except を除く）", () => {
  const files = ["src/features/x/a.ts", "src/features/x/CLAUDE.md", "src/features/x/core/a.ts", "src/features/y/keep.ts"];
  const config = { placement: [{ name: "feature-root-no-code", deny: ["src/features/*/*.{ts,tsx,css}"], except: ["src/features/y/**"], message: "機能の直下にコードを置かない" }] };
  assert.deepEqual(keys(checkPlacement(files, config)), ["placement:feature-root-no-code:src/features/x/a.ts"]);
});
