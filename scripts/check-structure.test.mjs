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
  cssSelectorsIn,
  firstCssClass,
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

test("グラフ: 同じ行き先は 1 本にまとめ、値も読むなら型だけに・静的にも読むなら動的にしない", () => {
  const sources = new Map([
    ["src/a.ts", 'import type { X } from "./b";\nimport { y } from "./b.js";\nimport type { Z } from "./c";\nconst D = () => import("./d");\nconst B = () => import("./b");'],
    ["src/b.ts", ""],
    ["src/c.ts", ""],
    ["src/d.tsx", ""],
    ["src/s.css", ".a {}"],
  ]);
  const graph = buildGraph(sources, { aliases: {} });
  assert.deepEqual(graph.get("src/a.ts"), [
    { path: "src/b.ts", typeOnly: false, dynamic: false },
    { path: "src/c.ts", typeOnly: true, dynamic: false },
    { path: "src/d.tsx", typeOnly: false, dynamic: true },
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

test("import の向き: except のファイルは見ない。dynamicAllowed なら動的な import だけの先は見逃す", () => {
  const graph = graphOf([
    ["src/renderer/registry.ts", ["src/renderer/f/contributes.ts"]],
    ["src/renderer/app.ts", ["src/renderer/f/contributes.ts"]],
    ["src/renderer/f/contributes.ts", [{ path: "src/renderer/f/Tab.tsx", typeOnly: false, dynamic: true }, "src/renderer/f/Other.tsx", { path: "src/renderer/f/Props.tsx", typeOnly: true }]],
  ]);
  const config = {
    ...layerConfig,
    imports: [
      { name: "reader", from: ["renderer"], except: ["src/renderer/registry.ts"], deny: ["src/renderer/*/contributes.ts"], message: "registry だけ" },
      { name: "static", from: ["src/renderer/*/contributes.ts"], typeOnlyAllowed: true, dynamicAllowed: true, deny: ["**/*.tsx"], message: "部品は動的に" },
    ],
  };
  assert.deepEqual(checkImports(graph, config).map((v) => v.key), ["import:reader:src/renderer/app.ts -> src/renderer/f/contributes.ts", "import:static:src/renderer/f/contributes.ts -> src/renderer/f/Other.tsx"]);
});

test("import の向き: pureLocal なら、読んでよいファイルがパッケージ（allowModules の外）を読むのも違反", () => {
  const graph = graphOf([
    ["src/f/ui/storage.ts", ["src/f/ui/views.ts", "src/f/ui/parse.ts"]],
    ["src/f/ui/views.ts", ["react", "src/shared/s.ts"]],
    ["src/f/ui/parse.ts", ["src/shared/s.ts"]],
  ]);
  const rule = { name: "ui-storage", from: ["src/f/ui/storage.ts"], allow: ["src/f/ui/*.ts"], allowModules: [], message: "純粋なものだけ" };
  assert.deepEqual(checkImports(graph, { ...layerConfig, imports: [rule] }), []);
  assert.deepEqual(
    checkImports(graph, { ...layerConfig, imports: [{ ...rule, pureLocal: true }] }).map((v) => v.key),
    ["import:ui-storage:src/f/ui/storage.ts -> src/f/ui/views.ts"],
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

test("基準線と比べる: 循環の輪からフォルダが抜けただけなら減った（通す）。フォルダが増えた・別の親の輪は新しい", () => {
  const cyc = (key) => ({ kind: "cycle", key: `cycle:${key}` });
  const baseline = { version: 1, violations: { cycle: ["siblings:src:app,features,foundation,shared", "siblings:src/a:x,y"] } };
  const result = compareWithBaseline([cyc("siblings:src:app,features,foundation"), cyc("siblings:src/a:x,y,z"), cyc("siblings:src/b:x,y")], baseline);
  assert.deepEqual(result.shrunk, [{ key: "cycle:siblings:src:app,features,foundation", from: "siblings:src:app,features,foundation,shared", to: "siblings:src:app,features,foundation" }]);
  assert.deepEqual(keys(result.added), ["cycle:siblings:src/a:x,y,z", "cycle:siblings:src/b:x,y"]);
  assert.deepEqual(result.stale, ["cycle:siblings:src:app,features,foundation,shared", "cycle:siblings:src/a:x,y"]);
});

test("基準線と比べる: 基準線がなければ、いまの違反が全部新しい", () => {
  const result = compareWithBaseline([imp("r:a -> b")], { version: 1, violations: {} });
  assert.equal(result.added.length, 1);
  assert.deepEqual(result.stale, []);
});

const keys = (violations) => violations.map((v) => v.key);

test("公開の口: 外からは entry だけ（テストからは testEntry も）。中どうしと except は見ない", () => {
  const graph = graphOf([
    ["src/features/board/core/x.ts", ["src/features/chat/core/index.ts", "src/features/chat/core/inner.ts", "src/features/chat/core/run/deep.ts", "src/features/chat/core/testing.ts", "zod"]],
    ["src/features/board/core/x.test.ts", ["src/features/chat/core/testing.ts"]],
    ["src/features/chat/core/run/a.ts", ["src/features/chat/core/inner.ts"]],
    ["src/app/core/start.ts", ["src/features/chat/core/inner.ts"]],
  ]);
  const config = { tests: ["**/*.test.ts"], publicApi: [{ name: "feature-core", dirs: "src/features/*/core", entry: ["index.ts"], testEntry: ["testing.ts"], except: ["src/app/**"] }] };
  assert.deepEqual(keys(checkPublicApi(graph, config)), [
    "public:feature-core:src/features/board/core/x.ts -> src/features/chat/core/inner.ts",
    "public:feature-core:src/features/board/core/x.ts -> src/features/chat/core/run/deep.ts",
    "public:feature-core:src/features/board/core/x.ts -> src/features/chat/core/testing.ts",
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

test("CSS のセレクター: カンマで分ける（括弧の中は分けない）。@media の中も拾い、@keyframes の中・コメント・文字・url()・宣言は拾わない", () => {
  const css = [
    "/* .commented { } */",
    ".chat-row:hover .x, :is(.a, .b) > .c { color: red; margin: .5rem; }",
    "@media (max-width: 600px) { .d { background: url(./img.e.png); } }",
    "@keyframes spin { 0% { opacity: .5; } }",
    '.f::before { content: ".g"; }',
  ].join("\n");
  assert.deepEqual(cssSelectorsIn(css), [".chat-row:hover .x", ":is(.a, .b) > .c", ".d", ".f::before"]);
});

test("CSS の最初のクラス: 括弧の外を先に、外になければ括弧の中。クラスがなければ null", () => {
  const selectors = [".menu.option-menu button", "html .agent-panel .composer", ":where(.compact) .chip", ".dot:is(.row *)", ":is(.head)", "textarea[hidden]"];
  assert.deepEqual(selectors.map(firstCssClass), ["menu", "agent-panel", "chip", "dot", "head", null]);
});

test("CSS のクラスの持ち主: 最初のクラスを 2 つの領域が書くと、書いた CSS がどれも違反。中の部品・:is() の中・同じ領域は見逃す", () => {
  const sources = new Map([
    ["src/features/chat/ui/a.css", ".chat-row {} .user-message .chip {} .chip:is(.user-message *) {}"],
    ["src/features/chat/ui/b.css", ".chat-row.open {}"],
    ["src/features/talk/ui/c.css", ".user-message {} .chat-row .x {}"],
    ["src/foundation/ui/d.css", ".btn {}"],
    ["src/features/talk/ui/e.css", ".talk .btn {}"],
  ]);
  const config = { cssClasses: { files: ["src/**/*.css"], areas: ["src/features/*", "src/foundation"] } };
  assert.deepEqual(keys(checkCssClasses(sources, config)).sort(), [
    "css:src/features/chat/ui/a.css:chat-row",
    "css:src/features/chat/ui/a.css:user-message",
    "css:src/features/chat/ui/b.css:chat-row",
    "css:src/features/talk/ui/c.css:chat-row",
    "css:src/features/talk/ui/c.css:user-message",
  ]);
});

test("禁じる書き方: 呼び出し・参照・引数なしの new・型の引数の合う new を数える。コメント・文字・allow・テストは数えない", () => {
  const code = [
    "const l = new Set<() => void>();",
    "const m = new Set<string>();",
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
  const forbid = [{ call: "setTimeout" }, { member: "Date.now" }, { new: "Date", args: 0 }, { new: "Set", typeArgs: "() => void" }];
  const config = { tests: ["**/*.test.ts"], patterns: [{ name: "no-raw-clock", files: ["src/core/**"], allow: ["src/core/clock.ts"], forbid, message: "時計は k.clock を通す" }] };
  const found = checkPatterns(sources, config);
  assert.deepEqual(
    found.map((v) => [v.key, v.value]),
    [["pattern:no-raw-clock:src/core/a.ts", 5]],
  );
});

test("禁じる書き方: exportExcept は並べた名前のほかの export を数える（default・export * も）", () => {
  const code = ['export const storage = 1;', 'const a = 2;', 'export { a as b };', 'export type T = string;', 'export function f() {}', 'export * from "./x";'].join("\n");
  const config = { tests: [], patterns: [{ name: "one-export", files: ["src/**"], forbid: [{ exportExcept: ["storage"] }], message: "storage だけ" }] };
  assert.deepEqual(
    checkPatterns(new Map([["src/a.ts", code], ["src/ok.ts", "export const storage = 1;\nconst x = 2;"]]), config).map((v) => [v.key, v.value]),
    [["pattern:one-export:src/a.ts", 4]],
  );
});

test("置かないファイル: deny に合うファイル（except を除く）", () => {
  const files = ["src/features/x/a.ts", "src/features/x/CLAUDE.md", "src/features/x/core/a.ts", "src/features/y/keep.ts"];
  const config = { placement: [{ name: "feature-root-no-code", deny: ["src/features/*/*.{ts,tsx,css}"], except: ["src/features/y/**"], message: "機能の直下にコードを置かない" }] };
  assert.deepEqual(keys(checkPlacement(files, config)), ["placement:feature-root-no-code:src/features/x/a.ts"]);
});
