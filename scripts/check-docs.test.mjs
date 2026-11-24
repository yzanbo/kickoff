import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ancestorDocs,
  checkFeatures,
  commentViolations,
  countForbidden,
  countLongLines,
  headingRefsIn,
  headingsOf,
  limitFor,
  measureDocs,
  missingNames,
  orderErrors,
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

test("上限は上から最初に合ったもの", () => {
  const limits = [
    { glob: "CLAUDE.md", bytes: 8192 },
    { glob: "src/foundation/*/CLAUDE.md", bytes: 6144 },
    { glob: "**/CLAUDE.md", bytes: 4096 },
  ];
  assert.equal(limitFor("CLAUDE.md", limits), 8192);
  assert.equal(limitFor("src/foundation/ui/CLAUDE.md", limits), 6144);
  assert.equal(limitFor("src/features/chat/CLAUDE.md", limits), 4096);
  assert.equal(limitFor("docs/notes.md", limits), null);
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
    "| 探す | NOTE-003 | T:core/http/server.projects,renderer/src/A | notes | |",
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

test("コメントの決まり（docs.config.mjs）: 経緯・外の文書の番号・道具の指示を見つけ、時の条件と書式の例は見逃す", async () => {
  const { commentForbidden } = (await import("./docs.config.mjs")).default;
  const flagged = (comment) => commentViolations("a.ts", `${comment}\nconst x = 1;`, commentForbidden).map((v) => v.label);
  for (const comment of ["// 前は別の形だった", "// 速くした（前は 2 回読んだ）", "// 以前は残した", "// 2026-11-23 に確かめた", "// Q3 で決めた", "// 分冊 04 の表", "// eslint-disable-next-line", "// 利用者の指摘で直した"]) {
    assert.equal(flagged(comment).length, 1, comment);
  }
  for (const comment of ["// 送る前は null", "// それより前は日付", "// 次は最初・前は最後", "// 日付の頭（「2026-11-09 」）", "// 名前は変えない"]) {
    assert.deepEqual(flagged(comment), [], comment);
  }
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

test("機能の並び: 見出しの下の表の名前が並びと同じなら空、違えば最初に食い違った所を返す", () => {
  const markdown = ["## 3. 機能の一覧と向き", "| # | 機能 | 中身 |", "|---|---|---|", "| 1 | `settings` | 設定 |", "| 2 | `chat` | チャット |"].join("\n");
  const order = (names) => orderErrors(markdown, { file: "docs/a.md", heading: "機能の一覧", column: 2, names });
  assert.deepEqual(order(["settings", "chat"]), []);
  assert.deepEqual(order(["chat", "settings"]), ["docs/a.md: 「機能の一覧」の表の 1 番目が settings（並びは chat）"]);
  assert.deepEqual(order(["settings", "chat", "board"]), ["docs/a.md: 「機能の一覧」の表の 3 番目が （ない）（並びは board）"]);
});

test("読んだ中身から数える: 大きさ・祖先との合計・置かない CLAUDE.md・語彙・コメント", () => {
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
    limits: [{ glob: "CLAUDE.md", bytes: 60 }, { glob: "**/CLAUDE.md", bytes: 40 }],
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
  const measured = measureDocs({ docs, code, files, config });
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

/** 決まりの値ごとに「通る・止まる」を見るための、小さな決まりと文書 */
function verdict(docs, { code = new Map(), limits = [{ glob: "**/CLAUDE.md", bytes: 10 }], ancestorsLimit = 100 } = {}) {
  const config = { limits, ancestorsLimit, lineLimit: 40, forbidden: FORBIDDEN, commentForbidden: COMMENT_RULES, commentFiles: ["src/**/*.ts"] };
  const files = new Set([...docs.keys(), ...code.keys()]);
  return summarize(measureDocs({ docs: new Map(docs), code, files, config })).total;
}

test("止める: 上限はちょうどまで通り、1 バイト超えで止まる", () => {
  assert.equal(verdict(new Map([["CLAUDE.md", "a".repeat(10)]])), 0);
  assert.equal(verdict(new Map([["CLAUDE.md", "a".repeat(11)]])), 1);
});

test("止める: 祖先の CLAUDE.md との合計はちょうどまで通り、超えると止まる", () => {
  const limits = [{ glob: "**/CLAUDE.md", bytes: 100 }];
  assert.equal(verdict(new Map([["CLAUDE.md", "a".repeat(10)], ["src/CLAUDE.md", "b".repeat(10)]]), { limits, ancestorsLimit: 20 }), 0);
  assert.equal(verdict(new Map([["CLAUDE.md", "a".repeat(10)], ["src/CLAUDE.md", "b".repeat(11)]]), { limits, ancestorsLimit: 20 }), 1);
});

test("止める: 1 行の上限・書かない言葉。docs-ignore の行と次の行は見逃す", () => {
  const limits = [];
  assert.equal(verdict(new Map([["README.md", "a".repeat(40)]]), { limits }), 0);
  assert.equal(verdict(new Map([["README.md", "a".repeat(41)]]), { limits }), 1);
  assert.equal(verdict(new Map([["README.md", "前は"]]), { limits }), 1);
  assert.equal(verdict(new Map([["README.md", "<!-- docs-ignore: 例 -->\n前は"]]), { limits }), 0);
});

test("止める: コメントの書かない言葉。comment-rules-ignore の行は見逃す", () => {
  const docs = new Map();
  assert.equal(verdict(docs, { code: new Map([["src/a.ts", "// 前は別の形"]]) }), 1);
  assert.equal(verdict(docs, { code: new Map([["src/a.ts", "// 前は別の形 comment-rules-ignore: 例"]]) }), 0);
});
