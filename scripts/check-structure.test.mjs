import assert from "node:assert/strict";
import { test } from "vitest";
import {
  baselineFrom,
  buildGraph,
  checkFileSizes,
  checkImports,
  compareWithBaseline,
  countLines,
  globToRegExp,
  parseImports,
  resolveSpecifier,
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
