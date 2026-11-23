import assert from "node:assert/strict";
import { test } from "vitest";
import { buildFileIndex, createFileLookup, markFilePaths, parseFileRef, parsePathCandidate, resolveFileRef, splitAbsolutePaths, type MdNode } from "./fileRefs";

const ROOT = "/Users/me/app";
const index = buildFileIndex(
  ["src/a.ts", "src/renderer/src/components/Markdown.tsx", "src/x/index.ts", "src/y/index.ts", "package.json", ".gitignore", "Makefile", "app/(group)/[id]/page.tsx"],
  ROOT,
);

test("parseFileRef: 一覧にあるファイル（相対パス・./ 付き・作業場所の絶対パス）を読む", () => {
  assert.deepEqual(parseFileRef("src/a.ts", index), { path: "src/a.ts" });
  assert.deepEqual(parseFileRef("./src/a.ts", index), { path: "src/a.ts" });
  assert.deepEqual(parseFileRef(`${ROOT}/src/a.ts`, index), { path: "src/a.ts" });
  assert.deepEqual(parseFileRef("package.json", index), { path: "package.json" });
  assert.deepEqual(parseFileRef(".gitignore", index), { path: ".gitignore" });
  assert.deepEqual(parseFileRef("app/(group)/[id]/page.tsx", index), { path: "app/(group)/[id]/page.tsx" });
});

test("parseFileRef: 行番号（:12 / :12:5 / :12-20 / #L12 / #L12-L20）を読む", () => {
  assert.deepEqual(parseFileRef("src/a.ts:12", index), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parseFileRef("src/a.ts:12:5", index), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parseFileRef("src/a.ts:12-20", index), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parseFileRef("src/a.ts#L12", index), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parseFileRef("src/a.ts#L12-L20", index), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parseFileRef("src/a.ts:0", index), { path: "src/a.ts" });
});

test("parseFileRef: フォルダを省いた形は、一覧の中で 1 つに決まるときだけ", () => {
  assert.deepEqual(parseFileRef("Markdown.tsx:3", index), { path: "src/renderer/src/components/Markdown.tsx", line: 3 });
  assert.deepEqual(parseFileRef("components/Markdown.tsx", index), { path: "src/renderer/src/components/Markdown.tsx" });
  assert.equal(parseFileRef("index.ts", index), undefined);
  assert.deepEqual(parseFileRef("x/index.ts", index), { path: "src/x/index.ts" });
  // 名前の途中で切れたものは一致させない
  assert.equal(parseFileRef("down.tsx", index), undefined);
});

test("parseFileRef: ファイルらしくないもの（拡張子なし・空白入り・URL・ほかの場所の絶対パス・一覧にない）はチップにしない", () => {
  for (const text of [
    "Makefile",
    "npm test",
    "src/a b.ts",
    "https://example.com/a.ts",
    "http://localhost:3000",
    "/tmp/a.ts",
    "~/a.ts",
    "../src/a.ts",
    "src/",
    "src/none.ts",
    "process.env",
    "foo()",
    "*.ts",
    "",
  ]) {
    assert.equal(parseFileRef(text, index), undefined, text);
  }
});

test("parseFileRef: 一覧が途中で切れているときは、フォルダ付きの形なら一覧になくても開く", () => {
  const truncated = buildFileIndex(["src/a.ts"], ROOT, true);
  assert.deepEqual(parseFileRef("src/deep/b.ts:4", truncated), { path: "src/deep/b.ts", line: 4 });
  assert.equal(parseFileRef("b.ts", truncated), undefined);
});

test("parsePathCandidate: 一覧を見ずにパスらしいかだけを決める（作業場所の絶対パス・./ を外す。フォルダを省いた形もそのまま）", () => {
  assert.deepEqual(parsePathCandidate(`${ROOT}/src/a.ts:12`, ROOT), { path: "src/a.ts", line: 12 });
  assert.deepEqual(parsePathCandidate("./src/none.ts", ROOT), { path: "src/none.ts" });
  assert.deepEqual(parsePathCandidate("Markdown.tsx#L3", ROOT), { path: "Markdown.tsx", line: 3 });
  for (const text of ["Makefile", "npm test", "https://example.com/a.ts", "/tmp/a.ts", "~/a.ts", "../src/a.ts", "src/", "foo()", ""]) {
    assert.equal(parsePathCandidate(text, ROOT), undefined, text);
  }
});

test("resolveFileRef: パスらしいものを一覧に引き当てる（行はそのまま。開けなければ undefined）", () => {
  assert.deepEqual(resolveFileRef({ path: "Markdown.tsx", line: 3 }, index), { path: "src/renderer/src/components/Markdown.tsx", line: 3 });
  assert.deepEqual(resolveFileRef({ path: "src/a.ts" }, index), { path: "src/a.ts" });
  assert.equal(resolveFileRef({ path: "src/none.ts" }, index), undefined);
  assert.equal(resolveFileRef({ path: "index.ts" }, index), undefined);
});

test("splitAbsolutePaths: 地の文の作業場所の絶対パスを分ける（句読点・日本語は含めない。ほかの場所は文字のまま。一覧にないものも元の文字付きで分ける）", () => {
  assert.deepEqual(splitAbsolutePaths(`${ROOT}/src/a.ts:12 を直しました。`, ROOT), [{ ref: { path: "src/a.ts", line: 12 }, text: `${ROOT}/src/a.ts:12` }, " を直しました。"]);
  assert.deepEqual(splitAbsolutePaths(`見る: ${ROOT}/src/a.tsを開く`, ROOT), ["見る: ", { ref: { path: "src/a.ts" }, text: `${ROOT}/src/a.ts` }, "を開く"]);
  assert.deepEqual(splitAbsolutePaths(`(${ROOT}/package.json).`, ROOT), ["(", { ref: { path: "package.json" }, text: `${ROOT}/package.json` }, ")."]);
  assert.deepEqual(splitAbsolutePaths(`${ROOT}/src/none.ts と /tmp/a.ts`, ROOT), [{ ref: { path: "src/none.ts" }, text: `${ROOT}/src/none.ts` }, " と /tmp/a.ts"]);
  // 拡張子のないもの・ほかの場所は文字のまま
  assert.deepEqual(splitAbsolutePaths(`${ROOT}/Makefile と /tmp/a.ts`, ROOT), [`${ROOT}/Makefile と /tmp/a.ts`]);
  // 似た名前の別のフォルダ（app-worktrees など）は作業場所ではない
  assert.deepEqual(splitAbsolutePaths(`${ROOT}-worktrees/w/src/a.ts`, ROOT), [`${ROOT}-worktrees/w/src/a.ts`]);
});

test("markFilePaths: インラインコード・リンク・地の文の絶対パスのうちパスらしいものに印を付ける（一覧は見ない。コードブロックとリンクの中は見ない）", () => {
  const tree: MdNode = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "inlineCode", value: "src/a.ts:3" },
          { type: "text", value: ` と ${ROOT}/package.json` },
          { type: "inlineCode", value: "npm test" },
          { type: "inlineCode", value: "src/new.ts" },
          { type: "link", url: "src/a.ts#L9", children: [{ type: "inlineCode", value: "a.ts" }] },
          { type: "link", url: "https://example.com", children: [{ type: "text", value: "x" }] },
        ],
      },
      { type: "code", value: "src/a.ts" },
    ],
  };
  markFilePaths(tree, ROOT);
  assert.deepEqual(tree.children?.[0].children, [
    { type: "link", url: "", children: [{ type: "inlineCode", value: "src/a.ts:3" }], data: { hProperties: { dataFilePath: "src/a.ts", dataFileLine: 3 } } },
    { type: "text", value: " と " },
    {
      type: "link",
      url: "",
      children: [{ type: "inlineCode", value: "package.json" }],
      data: { hProperties: { dataFilePath: "package.json", dataFileText: `${ROOT}/package.json` } },
    },
    { type: "inlineCode", value: "npm test" },
    // まだ一覧にない（これから作る）ファイルにも印を付ける（一覧に入れば、描き直さずに押せるようになる）
    { type: "link", url: "", children: [{ type: "inlineCode", value: "src/new.ts" }], data: { hProperties: { dataFilePath: "src/new.ts" } } },
    { type: "link", url: "src/a.ts#L9", children: [{ type: "inlineCode", value: "a.ts" }], data: { hProperties: { dataFilePath: "src/a.ts", dataFileLine: 9 } } },
    { type: "link", url: "https://example.com", children: [{ type: "text", value: "x" }] },
  ]);
  assert.deepEqual(tree.children?.[1], { type: "code", value: "src/a.ts" });
});

test("createFileLookup: 一覧を入れ替えて知らせると、新しくできたファイルが引き当たる", () => {
  const store = createFileLookup();
  assert.equal(store.resolve("src/a.ts"), undefined);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.replace(index);
  store.notify();
  assert.equal(calls, 1);
  assert.equal(store.resolve("Markdown.tsx"), "src/renderer/src/components/Markdown.tsx");
  assert.equal(store.resolve("src/new.ts"), undefined);
  store.replace(buildFileIndex(["src/a.ts", "src/new.ts"], ROOT));
  assert.equal(store.resolve("src/new.ts"), "src/new.ts");
  off();
  store.notify();
  assert.equal(calls, 1);
});
