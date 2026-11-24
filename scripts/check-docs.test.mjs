import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ancestorDocs,
  baselineFrom,
  checkFeatures,
  commentViolations,
  compareWithBaseline,
  countForbidden,
  countLongLines,
  headingRefsIn,
  headingsOf,
  limitFor,
  measureDocs,
  missingNames,
  pathRefsIn,
  refExists,
  summarize,
  vocabularyNames,
} from "./check-docs.mjs";

const FORBIDDEN = [
  { pattern: "(?<![名手直午])前は", label: "経緯（前は）" },
  { pattern: "以前は", label: "経緯（以前は）" },
  { pattern: "\\b20\\d\\d-\\d\\d-\\d\\d\\b", label: "日付" },
];

test("上限は上から最初に合ったもの。差し替えの { path, max } も読む", () => {
  const limits = [
    { glob: "CLAUDE.md", bytes: 8192 },
    { glob: "src/foundation/*/CLAUDE.md", bytes: 6144 },
    { glob: "**/CLAUDE.md", bytes: 4096 },
  ];
  assert.equal(limitFor("CLAUDE.md", limits), 8192);
  assert.equal(limitFor("src/foundation/ui/CLAUDE.md", limits), 6144);
  assert.equal(limitFor("src/features/chat/CLAUDE.md", limits), 4096);
  assert.equal(limitFor("docs/notes.md", limits), null);
  assert.equal(limitFor("src/core/CLAUDE.md", [{ path: "src/core/CLAUDE.md", max: 9000 }, ...limits]), 9000);
  assert.equal(limitFor("src/core/CLAUDE.md", [{ glob: "src/core/**", max: 7000 }, ...limits]), 7000);
});

test("祖先の CLAUDE.md は、ある分だけ近い順にリポジトリの直下まで", () => {
  const docs = new Set(["CLAUDE.md", "src/a/CLAUDE.md", "src/a/b/c/CLAUDE.md"]);
  assert.deepEqual(ancestorDocs("src/a/b/c/CLAUDE.md", docs), ["src/a/b/c/CLAUDE.md", "src/a/CLAUDE.md", "CLAUDE.md"]);
  assert.deepEqual(ancestorDocs("CLAUDE.md", docs), ["CLAUDE.md"]);
});

test("長い行はバイトで数え、表の行とコードの囲みの中は数えない", () => {
  const long = "あ".repeat(201); // 603 バイト
  const text = [long, "a".repeat(600), `| ${long} |`, "```", long, "```", `- ${long}`].join("\n");
  assert.equal(countLongLines(text, 600), 2);
});

test("書かない言葉: 「名前は」などは経緯にしない・「以前は」は 1 つに数える・行の番号を返す", () => {
  const text = ["名前は手前は直前は午前は変えない", "前は別の形だった", "以前は別の形だった", "2026-11-19 に作った", "版は 12026-11-190 ではない"].join("\n");
  assert.deepEqual(countForbidden(text, FORBIDDEN), [
    { label: "経緯（前は）", line: 2 },
    { label: "経緯（前は）", line: 3 },
    { label: "日付", line: 4 },
  ]);
});

test("書かない言葉: docs-ignore の行と次の行・HTML のコメントの中は見逃す", () => {
  const text = [
    "前は A <!-- docs-ignore: 例として書く -->",
    "前は B",
    "前は C",
    "<!-- 行き先: 前は",
    "前は D -->",
    "<!-- 前は E --> 前は F",
  ].join("\n");
  assert.deepEqual(
    countForbidden(text, FORBIDDEN).map((v) => v.line),
    [3, 6],
  );
});

test("ファイルの参照: / と決めた拡張子があるものだけ。形の例・外のパス・囲みの中は拾わない", () => {
  const text = [
    "`src/core/a.ts` と `chat/runner.ts` と `../x/y.md` と `@shared/b.ts`",
    "`a.ts` `src/*.ts` `src/<名前>.ts` `src/…/a.ts` `src/a b.ts` `scripts/{a,b}.mjs` `src/core/bus.ts:12` `src/core`",
    "`/Applications/x.json` `~/Library/a.json` `https://example.com/a.js`",
    "```",
    "`src/in/fence.ts`",
    "```",
  ].join("\n");
  assert.deepEqual(pathRefsIn(text), ["src/core/a.ts", "chat/runner.ts", "../x/y.md", "@shared/b.ts"]);
});

test("参照の見つけ方: 直下からの相対・文書のフォルダからの相対・後ろの一致（/ の境目）・別名", () => {
  const files = new Set(["src/core/chat/runner.ts", "src/x/y.md", "src/shared/b.ts"]);
  const doc = "src/a/CLAUDE.md";
  assert.ok(refExists("src/core/chat/runner.ts", doc, files));
  assert.ok(refExists("./src/x/y.md", "CLAUDE.md", files));
  assert.ok(refExists("../x/y.md", doc, files));
  assert.ok(refExists("chat/runner.ts", doc, files));
  assert.ok(!refExists("hat/runner.ts", doc, files));
  assert.ok(refExists("@shared/b.ts", doc, files, { "@shared/": "src/shared/" }));
  assert.ok(!refExists("@shared/b.ts", doc, files));
  assert.ok(!refExists("src/core/chat/missing.ts", doc, files));
});

test("見出しの参照: 「`….md` の「見出し」」を拾い、見出しの中の「」もそのまま", () => {
  const text = "画面全体の `src/renderer/src/CLAUDE.md` の「性能」と `features/trash/CLAUDE.md` の「会話の中の「元に戻す」」・`docs/architecture.md`の「語彙」";
  assert.deepEqual(headingRefsIn(text), [
    { doc: "src/renderer/src/CLAUDE.md", heading: "性能" },
    { doc: "features/trash/CLAUDE.md", heading: "会話の中の「元に戻す」" },
    { doc: "docs/architecture.md", heading: "語彙" },
  ]);
  assert.deepEqual(headingsOf(["# 題", "## 1. 語彙", "- 箇条", "```", "# 囲みの中", "```", "### 性能 ###"].join("\n")), ["題", "1. 語彙", "性能"]);
});

test("見出しの参照は、どれかの候補の見出しの行にあれば通す（箇条の言葉は見出しではない）", () => {
  const docs = new Map([
    ["CLAUDE.md", ["# 決まり", "- 性能: 箇条"].join("\n")],
    ["src/r/CLAUDE.md", ["# 画面", "## 性能"].join("\n")],
    ["src/r/x/CLAUDE.md", "画面全体の `CLAUDE.md` の「性能」と `src/r/CLAUDE.md` の「置き場所」"],
  ]);
  const files = new Set(docs.keys());
  const measured = measureDocs({ docs, files, config: {} });
  assert.equal(measured.files["src/r/x/CLAUDE.md"].brokenRefs, 1);
  assert.deepEqual(
    measured.details.filter((d) => d.metric === "brokenRefs").map((d) => d.message),
    ["切れた参照: `src/r/CLAUDE.md` の「置き場所」がない"],
  );
});

const FEATURE_FILES = new Set(["src/core/http/server.projects.test.ts", "src/features/notes/core/routes.test.ts", "src/renderer/src/A.test.tsx", "scripts/e2e/scenarios/sidebar.mjs"]);

test("機能の一覧: 正しい表は通す。列は見出しの名前で引き、知らない列と ID のない表は読み飛ばす", () => {
  const text = [
    "| 列 | 中身 |",
    "|---|---|",
    "| x | y |",
    "",
    "| 機能 | ID | 確かめ方 | 持ち主 | 足した列 |",
    "|---|---|---|---|---|",
    "| 作る | PRJ-001 | M | projects | 何か |",
    "| 取り込む | PRJ-002 | T:server.projects,A | projects | |",
    "| 開く | NOTE-001 | `E:sidebar`, T:A, M | notes | |",
    "| 書く | NOTE-002 | T:notes/routes | notes | |",
    "",
    "| ID | 要件 | 確かめ方 |",
    "|---|---|---|",
    "| NF-01 | 速い | M |",
  ].join("\n");
  assert.deepEqual(checkFeatures(text, FEATURE_FILES), []);
});

test("機能の一覧: ID の形・重なり・確かめ方の形・T: と E: の名前の実在", () => {
  const text = [
    "| ID | 機能 | 確かめ方 |",
    "|---|---|---|",
    "| PRJ-1 | a | M |",
    "| PRJ-001 | b | M |",
    "| PRJ-001 | c | X |",
    "| CHT-001 | d | T:nothing |",
    "| CHT-002 | e | E:nothing |",
    "| CHT-003 | f | |",
  ].join("\n");
  assert.deepEqual(checkFeatures(text, FEATURE_FILES), [
    "docs/features.md:3: ID「PRJ-1」の形が違う（PRJ-001・NF-01 の形）",
    "docs/features.md:5: ID PRJ-001 が 4 行目と重なる",
    "docs/features.md:5: PRJ-001: 確かめ方「X」は M・T:<テストの名前>・E:<通しの確かめの名前> をカンマで並べる",
    "docs/features.md:6: CHT-001: T:nothing のテスト（nothing.test.ts・.test.tsx）がない",
    "docs/features.md:7: CHT-002: E:nothing の通しの確かめ（scripts/e2e/scenarios/nothing.mjs）がない",
    "docs/features.md:8: CHT-003: 確かめ方「」は M・T:<テストの名前>・E:<通しの確かめの名前> をカンマで並べる",
  ]);
});

const COMMENT_RULES = [
  { pattern: "(?<![名手直午])前は|以前は", label: "経緯" },
  { pattern: "案 ?\\d+", label: "外の文書の番号" },
];

test("コメントの書かない言葉: コメントの中だけを数え、行の番号を返す。comment-rules-ignore の行は見逃す", () => {
  const source = [
    "// 名前は変えない",
    'const s = "前は文字の中";',
    "/**",
    " * 前は別の形だった（案 3）",
    " */",
    "const t = `以前は`; // 以前は 1 つ",
    "// 前は残す comment-rules-ignore: 例として書く",
  ].join("\n");
  assert.deepEqual(commentViolations("a.ts", source, COMMENT_RULES), [
    { label: "経緯", line: 4 },
    { label: "外の文書の番号", line: 4 },
    { label: "経緯", line: 6 },
  ]);
  assert.deepEqual(commentViolations("b.ts", "const x = 1; // ふつうのコメント", COMMENT_RULES), []);
});

test("語彙: 見出しの下の表の決めた列から、識別子の形の名前だけを拾う（次の見出しまで）", () => {
  const markdown = [
    "## 1. 語彙",
    "| 画面の言葉 | コード | 以前 |",
    "|---|---|---|",
    "| チャット | `Chat` / 表 `chats`・`features/chat/` | `Run` |",
    "| 開く | `GET\\|POST /api/x`・`openChat` | なし |",
    "### 下の節",
    "| 軸 | `NotThis` |",
    "|---|---|",
    "| a | `NorThis` |",
  ].join("\n");
  assert.deepEqual(vocabularyNames(markdown, "語彙", 2), ["Chat", "chats", "openChat"]);
  assert.deepEqual(vocabularyNames(markdown, "ない見出し", 2), []);
});

test("語彙: 語として出てこない名前だけを返す（長い名前の一部は数えない）", () => {
  const sources = new Map([
    ["src/a.ts", "export type ChatEvents = 1; const chat_id = 2;"],
    ["src/b.ts", "openChat()"],
  ]);
  assert.deepEqual(missingNames(["ChatEvent", "chat_id", "openChat", "Queue"], sources), ["ChatEvent", "Queue"]);
});

/** 比べる・書き直すための小さな数 */
function measuredOf(overrides = {}) {
  return {
    files: { "CLAUDE.md": { bytes: 100, ancestors: 100, longLines: 0, forbidden: 0, brokenRefs: 0 } },
    limits: { "CLAUDE.md": { bytes: 200, ancestors: 300 } },
    comments: {},
    vocabulary: 0,
    forbiddenFiles: [],
    features: [],
    details: [],
    ...overrides,
  };
}

const fileOf = (values) => ({ "CLAUDE.md": { bytes: 100, ancestors: 100, longLines: 0, forbidden: 0, brokenRefs: 0, ...values } });

test("基準線と比べる: 上限の中なら通し、基準線にない違反・増えた違反を落とす", () => {
  assert.deepEqual(compareWithBaseline(measuredOf(), { files: {} }), { added: [], stale: [], grown: [], shrunk: [] });
  const over = measuredOf({ files: fileOf({ bytes: 250, forbidden: 2 }) });
  assert.deepEqual(compareWithBaseline(over, {}).added, ["bytes:CLAUDE.md: 250（上限 200）", "forbidden:CLAUDE.md: 2（上限 0）"]);
  const base = { files: { "CLAUDE.md": { bytes: 240, ancestors: 100, longLines: 0, forbidden: 3, brokenRefs: 0 } } };
  const result = compareWithBaseline(over, base);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.grown, ["bytes:CLAUDE.md: 240 → 250"]);
  assert.deepEqual(result.shrunk, ["forbidden:CLAUDE.md: 3 → 2"]);
  // 基準線の値より大きくても、上限の中なら通す
  assert.deepEqual(compareWithBaseline(measuredOf({ files: fileOf({ bytes: 150, forbidden: 1 }) }), base).grown, []);
});

test("基準線と比べる: 直ったのに残る項目・なくなったファイルを落とす", () => {
  const base = {
    files: { "CLAUDE.md": { bytes: 250 }, "gone/CLAUDE.md": { bytes: 9000 } },
    comments: { "src/a.ts": 2 },
    vocabulary: 3,
    forbiddenFiles: ["src/shared/CLAUDE.md"],
  };
  assert.deepEqual(compareWithBaseline(measuredOf(), base).stale, ["files:CLAUDE.md", "files:gone/CLAUDE.md", "comments:src/a.ts", "vocabulary", "forbiddenFiles:src/shared/CLAUDE.md"]);
});

test("基準線と比べる: コメント・語彙・置かない CLAUDE.md・機能の一覧の誤り", () => {
  const measured = measuredOf({ comments: { "src/a.ts": 3, "src/b.ts": 1 }, vocabulary: 4, forbiddenFiles: ["src/features/CLAUDE.md"], features: ["docs/features.md:3: 誤り"] });
  const result = compareWithBaseline(measured, { comments: { "src/a.ts": 2 }, vocabulary: 5, forbiddenFiles: [] });
  assert.deepEqual(result.added, ["comments:src/b.ts: 1（上限 0）", "forbiddenFiles: src/features/CLAUDE.md", "features: docs/features.md:3: 誤り"]);
  assert.deepEqual(result.grown, ["comments:src/a.ts: 2 → 3"]);
  assert.deepEqual(result.shrunk, ["vocabulary: 5 → 4"]);
});

test("基準線を作る: 上限を超えたファイルだけ、全部の数を載せる", () => {
  const measured = measuredOf({
    files: { ...fileOf({ forbidden: 1 }), "README.md": { bytes: 10, longLines: 0, forbidden: 0, brokenRefs: 0 } },
    limits: { "CLAUDE.md": { bytes: 200, ancestors: 300 }, "README.md": { bytes: 100 } },
    comments: { "src/b.ts": 1, "src/a.ts": 2 },
    vocabulary: 2,
  });
  assert.deepEqual(baselineFrom(measured), {
    version: 1,
    files: { "CLAUDE.md": { bytes: 100, ancestors: 100, longLines: 0, forbidden: 1, brokenRefs: 0 } },
    comments: { "src/a.ts": 2, "src/b.ts": 1 },
    vocabulary: 2,
    forbiddenFiles: [],
  });
  assert.deepEqual(compareWithBaseline(measured, baselineFrom(measured)), { added: [], stale: [], grown: [], shrunk: [] });
});

test("読んだ中身から数える: 大きさ・祖先との合計・差し替えの上限・置かない CLAUDE.md・語彙・コメント", () => {
  const docs = new Map([
    ["CLAUDE.md", "a".repeat(50)],
    ["src/x/CLAUDE.md", `${"b".repeat(30)}\n前は\n<!-- 行き先: 前は -->`],
    ["src/shared/CLAUDE.md", "c"],
    ["docs/architecture.md", ["## 語彙", "| 言葉 | コード |", "|---|---|", "| チャット | `Chat`・`Missing` |"].join("\n")],
  ]);
  const code = new Map([
    ["src/a.ts", "// 前は\nexport type Chat = 1;"],
    ["src/a.test.ts", "// 前は"],
  ]);
  const config = {
    limits: [{ glob: "**/CLAUDE.md", bytes: 40 }],
    ancestorsLimit: 70,
    lineLimit: 600,
    forbidden: FORBIDDEN,
    commentForbidden: COMMENT_RULES,
    commentFiles: ["src/**/*.ts"],
    commentExclude: ["**/*.test.ts"],
    forbiddenFiles: ["src/shared/CLAUDE.md", "src/features/CLAUDE.md"],
    vocabulary: { file: "docs/architecture.md", heading: "語彙", column: 2, search: ["src"] },
  };
  const files = new Set([...docs.keys(), ...code.keys()]);
  const measured = measureDocs({ docs, code, files, config, extraLimits: [{ path: "CLAUDE.md", max: 60 }] });
  assert.deepEqual(measured.files["CLAUDE.md"], { bytes: 50, ancestors: 50, longLines: 0, forbidden: 0, brokenRefs: 0 });
  assert.deepEqual(measured.files["src/x/CLAUDE.md"], { bytes: 64, ancestors: 114, longLines: 0, forbidden: 1, brokenRefs: 0 });
  assert.deepEqual(measured.files["docs/architecture.md"].ancestors, undefined);
  assert.deepEqual(measured.comments, { "src/a.ts": 1 });
  assert.equal(measured.vocabulary, 1);
  assert.deepEqual(measured.forbiddenFiles, ["src/shared/CLAUDE.md"]);
  assert.deepEqual(summarize(measured), {
    files: 4,
    overBytes: 1,
    overAncestors: 1,
    longLines: 0,
    forbidden: 1,
    brokenRefs: 0,
    comments: 1,
    vocabulary: 1,
    forbiddenFiles: 1,
    features: 0,
    total: 6,
  });
  assert.deepEqual(measureDocs({ docs, code, files, config, only: "comments" }).files, {});
});
