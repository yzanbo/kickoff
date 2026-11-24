import assert from "node:assert/strict";
import { test } from "vitest";
import { checkTable, fixRowsOf, mergeTables, parseBaseTable, parseMoveTable, reportLeftovers, rewritePathStrings, rewriteSource, rewriteSpecifier } from "./move.mjs";

// 旧の木と移動表（小さな例）
const MOVES = {
  "src/core/chat/runner.ts": "src/features/chat/core/run/runner.ts",
  "src/core/chat/turn.ts": "src/features/chat/core/run/turn.ts",
  "src/core/chat/queue.ts": "src/features/queue/core/queue.ts",
  "src/core/git/index.ts": "src/features/git/core/index.ts",
  "src/core/git/gitIndex.ts": "src/features/git/core/gitIndex.ts",
  "src/core/databases/entry.ts": "src/features/database/core/entry.ts",
  "src/core/databases/worker/main.ts": "src/features/database/worker/main.ts",
  "src/renderer/src/lib/time.ts": "src/foundation/ui/time.ts",
  "src/renderer/src/features/chat/Chat.tsx": "src/features/conversation/ui/Chat.tsx",
  "src/renderer/src/features/chat/ChatHead.tsx": "src/features/conversation/ui/ChatHead.tsx",
  "src/renderer/src/features/editor/fileIcons.ts": "src/features/files/ui/fileIcons.ts",
  "src/renderer/src/styles/index.css": "src/foundation/ui/styles/index.css",
  "src/renderer/src/features/editor/editor.css": "src/features/files/ui/editor.css",
  "src/renderer/src/styles/base/tokens.css": "src/foundation/ui/styles/base/tokens.css",
  "src/renderer/src/main.tsx": "src/app/renderer/main.tsx",
  "src/renderer/index.html": "src/app/renderer/index.html",
  "src/shared/types/chat.ts": "src/shared/chat/types.ts",
  "src/shared/types/index.ts": "src/shared/types/index.ts",
};
const FILES = new Set([...Object.keys(MOVES), "package.json", "scripts/x.mjs", "mobile/src/a.ts"]);
const ctx = { byFrom: new Map(Object.entries(MOVES)), exists: (p) => FILES.has(p) };
const spec = (from, s, kind) => rewriteSpecifier(from, MOVES[from] ?? from, s, ctx, kind);

test("指定: 相対 → 同じフォルダは ./、違うフォルダは @/、.js は外す", () => {
  assert.equal(spec("src/core/chat/runner.ts", "./turn.js"), "./turn");
  assert.equal(spec("src/core/chat/runner.ts", "./queue.js"), "@/features/queue/core/queue");
  assert.equal(spec("src/core/chat/runner.ts", "../git/gitIndex.js"), "@/features/git/core/gitIndex");
});

test("指定: @/（旧 = 画面）→ @/（新 = src）・@shared はそのまま別名・束ねのフォルダは index で書く", () => {
  assert.equal(spec("src/renderer/src/features/chat/Chat.tsx", "@/lib/time"), "@/foundation/ui/time");
  assert.equal(spec("src/renderer/src/features/chat/Chat.tsx", "./ChatHead"), null);
  assert.equal(spec("src/core/chat/runner.ts", "@shared/types/chat"), "@shared/chat/types");
  assert.equal(spec("src/core/chat/runner.ts", "@shared/types"), null);
  assert.equal(spec("src/core/chat/runner.ts", "../git/index.js"), "@/features/git/core/index");
  assert.equal(spec("src/core/chat/runner.ts", "../git"), "@/features/git/core");
});

test("指定: パッケージ・解けない指定は変えない", () => {
  assert.equal(spec("src/core/chat/runner.ts", "node:fs"), null);
  assert.equal(spec("src/core/chat/runner.ts", "@modelcontextprotocol/sdk/server/mcp.js"), null);
  assert.equal(spec("src/core/chat/runner.ts", "./none.js"), null);
});

test("指定: src の外（scripts・mobile）は相対のまま・拡張子の書き方も元のまま。@shared は別名のまま", () => {
  assert.equal(spec("scripts/x.mjs", "../src/core/chat/turn.ts"), "../src/features/chat/core/run/turn.ts");
  assert.equal(spec("scripts/x.mjs", "../src/core/chat/turn.js"), "../src/features/chat/core/run/turn.js");
  assert.equal(spec("mobile/src/a.ts", "@shared/types/chat"), "@shared/chat/types");
  assert.equal(spec("mobile/src/a.ts", "../../src/shared/types/chat"), "../../src/shared/chat/types");
});

test("中身: import type・export * from・動的 import・vi.mock を書き換え、並びと空白は触らない", () => {
  const before = [
    'import type { A } from "./turn.js";',
    'export * from "./queue.js";',
    "const m = await import('../git/gitIndex.js');",
    'vi.mock("./turn.js", () => ({}));', // test-rules-ignore: 移動の道具が書き換える文字の例
    'type P = import("./queue.js").Q;',
    "// 例: 文字の中の './turn.js' は触らない",
  ].join("\n");
  const after = rewriteSource("src/core/chat/runner.ts", MOVES["src/core/chat/runner.ts"], before, ctx);
  assert.equal(
    after,
    [
      'import type { A } from "./turn";',
      'export * from "@/features/queue/core/queue";',
      "const m = await import('@/features/git/core/gitIndex');",
      'vi.mock("./turn", () => ({}));', // test-rules-ignore: 移動の道具が書き換える文字の例
      'type P = import("@/features/queue/core/queue").Q;',
      "// 例: 文字の中の './turn.js' は触らない",
    ].join("\n"),
  );
});

test("中身: new URL と import.meta.glob（node_modules）は新しい位置からの相対", () => {
  const entry = rewriteSource("src/core/databases/entry.ts", MOVES["src/core/databases/entry.ts"], 'new URL("./worker/main.ts", import.meta.url)', ctx);
  assert.equal(entry, 'new URL("../worker/main.ts", import.meta.url)');
  const icons = 'import.meta.glob<string>("../../../../../node_modules/material-icon-theme/icons/*.svg", { eager: true })';
  assert.equal(
    rewriteSource("src/renderer/src/features/editor/fileIcons.ts", MOVES["src/renderer/src/features/editor/fileIcons.ts"], icons, ctx),
    'import.meta.glob<string>("../../../../node_modules/material-icon-theme/icons/*.svg", { eager: true })',
  );
  assert.equal(spec("src/renderer/src/features/editor/fileIcons.ts", "../../../../../node_modules/monaco-editor/esm/x.js"), "../../../../node_modules/monaco-editor/esm/x.js");
});

test("中身: CSS の @import・url() と HTML の src・href は相対", () => {
  const css = '@import "../../styles/base/tokens.css";\n.a { background: url("../../../../../node_modules/x/y.png"); }';
  assert.equal(
    rewriteSource("src/renderer/src/features/editor/editor.css", MOVES["src/renderer/src/features/editor/editor.css"], css, ctx),
    '@import "../../../foundation/ui/styles/base/tokens.css";\n.a { background: url("../../../../node_modules/x/y.png"); }',
  );
  assert.equal(rewriteSource("src/renderer/src/styles/index.css", MOVES["src/renderer/src/styles/index.css"], '@import "./base/tokens.css";', ctx), '@import "./base/tokens.css";');
  const html = '<script type="module" src="./src/main.tsx"></script><link rel="icon" href="/favicon.svg" />';
  assert.equal(rewriteSource("src/renderer/index.html", MOVES["src/renderer/index.html"], html, ctx), '<script type="module" src="./main.tsx"></script><link rel="icon" href="/favicon.svg" />');
});

test("移動表: ```tsv の塊を読み、# と空行と - の行を飛ばす。列の数が違えば投げる", () => {
  const text = "前置き\n```tsv\n# 注\na\tb\tなぜ\n\nc\t-\tあとで消す\n```\n";
  assert.deepEqual(parseMoveTable(text), [{ from: "a", to: "b" }]);
  assert.deepEqual(parseMoveTable("a\tb\n"), [{ from: "a", to: "b" }]);
  assert.throws(() => parseMoveTable("a\n"));
  assert.deepEqual(parseBaseTable("a\tb\t分冊 04: なぜ\n"), [{ from: "a", to: "b", reason: "分冊 04: なぜ" }]);
});

test("検査: 9 種類の問題を見つけ、決めた例外は通す", () => {
  const files = ["src/a.ts", "src/b.ts", "src/c.ts", "src/x.test.ts", "src/x.ts", "src/d.ts", "src/e.ts", "src/f.ts", "src/g.ts", "src/h.ts", "src/shared/types/index.ts"];
  const rows = [
    { from: "src/a.ts", to: "src/features/chat/core/a.ts" },
    { from: "src/a.ts", to: "src/features/chat/core/a2.ts" },
    { from: "src/gone.ts", to: "src/features/chat/core/gone.ts" },
    { from: "src/b.ts", to: "src/features/chat/core/same.ts" },
    { from: "src/c.ts", to: "src/features/chat/core/same.ts" },
    { from: "src/d.ts", to: "src/features/chat/core/Same.ts" },
    { from: "src/e.ts", to: "src/elsewhere/e.ts" },
    { from: "src/f.ts", to: "src/features/nope/core/f.ts" },
    { from: "src/g.ts", to: "src/foundation/CLAUDE.md" },
    { from: "src/x.ts", to: "src/features/chat/core/x.ts" },
    { from: "src/x.test.ts", to: "src/features/chat/ui/x.test.ts" },
    { from: "src/shared/types/index.ts", to: "src/shared/types/index.ts" },
  ];
  const kinds = checkTable(rows, files).map((p) => p.kind);
  for (const kind of ["duplicate-from", "unknown", "missing", "duplicate-to", "case-collision", "bad-root", "unknown-feature", "middle-claude", "test-apart"]) {
    assert.ok(kinds.includes(kind), kind);
  }
  assert.equal(kinds.filter((k) => k === "missing").length, 1);
  assert.deepEqual(checkTable([{ from: "src/a.ts", to: "src/app/core/a.ts" }], files, { partial: true }), []);
  assert.deepEqual(checkTable([{ from: "src/a.ts", to: "src/features/database/testing/a.ts" }], ["src/a.ts"]), []);
  assert.deepEqual(checkTable([{ from: "src/a.ts", to: "src/features/chat/a.ts" }], ["src/a.ts"]).map((p) => p.kind), ["bad-root"]);
});

test("組み立て: 付録に分冊の 5 章の直しを当てる（付録が決めた行・消す印・フォルダの残り・テストは対象の隣）", () => {
  const base = parseBaseTable(
    ["src/p/a.ts\tsrc/features/chat/core/a.ts", "src/p/b.ts\tsrc/features/chat/core/b.ts\t分冊 09: 決めた", "src/p/c.ts\tsrc/features/chat/core/c.ts", "src/q/x.ts\tsrc/features/chat/ui/x.ts", "src/q/x.test.ts\tsrc/features/chat/ui/x.test.ts", "src/q/y.ts\tsrc/features/chat/ui/y.ts"].join("\n"),
  );
  const doc = (rows) => `## 5. 移動表の直し\n\n\`\`\`tsv\n${rows.join("\n")}\n\`\`\`\n\n## 6. 次\n\`\`\`tsv\nsrc/p/a.ts\tsrc/features/x/core/a.ts\n\`\`\`\n`;
  const fixes = [
    { name: "05", rows: fixRowsOf(doc(["src/p/a.ts\tsrc/features/ai/core/a.ts\t理由", "src/p/b.ts\tsrc/features/ai/core/b.ts\t理由", "src/p/c.ts\t（消す）\tあとで"])) },
    { name: "06", rows: fixRowsOf(doc(["src/q/x.ts\tsrc/features/conversation/ui/x.ts\t理由", "src/q/\tsrc/features/queue/ui/\t残り"])) },
  ];
  assert.equal(fixes[0].rows.length, 3);
  const { rows, rejected, unresolved } = mergeTables(base, fixes);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.from, r.to])), {
    "src/p/a.ts": "src/features/ai/core/a.ts",
    "src/p/b.ts": "src/features/chat/core/b.ts",
    "src/p/c.ts": "src/features/chat/core/c.ts",
    "src/q/x.ts": "src/features/conversation/ui/x.ts",
    "src/q/x.test.ts": "src/features/conversation/ui/x.test.ts",
    "src/q/y.ts": "src/features/queue/ui/y.ts",
  });
  assert.deepEqual(rejected.map((r) => r.from).sort(), ["src/p/b.ts", "src/q/x.test.ts"]);
  assert.deepEqual(unresolved, []);
});

test("設定のパスの文字（JSON のキー・「パス:関数名」）を表で書き換え、表にないものは触らない", () => {
  const byFrom = new Map([["src/renderer/src/hooks/useRowWindow.ts", "src/foundation/ui/hooks/useRowWindow.ts"]]);
  assert.equal(
    rewritePathStrings('{ "src/renderer/src/hooks/useRowWindow.ts:useRowWindow": "理由", "src/other.ts": 3 }', byFrom),
    '{ "src/foundation/ui/hooks/useRowWindow.ts:useRowWindow": "理由", "src/other.ts": 3 }',
  );
});

test("残り: 移す前のパスの文字と、画面の root からの /src/… を出す", () => {
  const files = { "a.ts": 'const x = "src/core/db/open.ts";\nconst y = "src/features/a.ts";\n// src/shared/types/chat.ts', "b.mjs": 'await import("/src/lib/storage.ts");\nmobile/src/core/x' };
  const found = reportLeftovers(Object.keys(files), (f) => files[f], new Set(["src/shared/types/chat.ts"]));
  assert.deepEqual(
    found.map((l) => `${l.file}:${l.line}`),
    ["a.ts:1", "a.ts:3", "b.mjs:1"],
  );
});
