import assert from "node:assert/strict";
import { test } from "vitest";
import { createBlockScanner, createBlockSplitter, splitBlocks } from "./markdownBlocks";

test("最後のブロックの頭は空行のあとの最初の行。空行で終わっていれば、次の行が来るまで前のブロックのまま", () => {
  const scan = (text: string) => createBlockScanner().scan(text);
  assert.equal(scan("一\n二").blockStart, 0);
  assert.equal(scan("一\n\n二").blockStart, 3);
  assert.equal(scan("一\n\n").blockStart, 0);
  assert.equal(scan("一\n\n\n三\n四").blockStart, 4);
});

test("コードブロック・数式ブロックの中の空行では分けず、開いたままなら開きの位置を返す", () => {
  const scanner = createBlockScanner();
  const text = "前\n\n```ts\na\n\nb\n```\n後\n\n$$\nx\n\ny";
  assert.deepEqual(scanner.scan(text, 9), { blockStart: 3, fence: { start: 3, char: "`", length: 3, infoDone: true }, mathStart: null, closedAt: 0 });
  const tail = scanner.scan(text);
  assert.equal(tail.fence, null);
  assert.equal(tail.mathStart, text.indexOf("$$"));
  assert.equal(tail.blockStart, text.indexOf("$$"));
  assert.equal(tail.closedAt, text.indexOf("後"));
  // 開きの行の書きかけ（改行がまだ）
  assert.deepEqual(createBlockScanner().scan("前\n~~~~py").fence, { start: 2, char: "~", length: 4, infoDone: false });
  // ``` の言語名に ` があれば開きではない
  assert.equal(createBlockScanner().scan("```a`b\n").fence, null);
});

test("続きでない文が来たら初めから読み直す", () => {
  const scanner = createBlockScanner();
  assert.notEqual(scanner.scan("```\ncode\n").fence, null);
  assert.equal(scanner.scan("別の\n\n文").fence, null);
  assert.equal(scanner.scan("別の\n\n文").blockStart, 4);
});

test("splitBlocks: 空行で分け、末尾の空行は落とす。分けると描き方が変わる所では分けない", () => {
  const cases: [string, string[]][] = [
    ["段落\n続き\n\n# 見出し\n\n> 引用\n\n| a |\n|---|\n| 1 |\n\n---", ["段落\n続き", "# 見出し", "> 引用", "| a |\n|---|\n| 1 |", "---"]],
    // フェンスの中の空行・閉じなし・~~~・4 つのバッククォート
    ["前\n\n```ts\na\n\nb\n```\n\n後", ["前", "```ts\na\n\nb\n```", "後"]],
    ["前\n\n~~~\na\n\n```\nb\n~~~\n\n後", ["前", "~~~\na\n\n```\nb\n~~~", "後"]],
    ["````md\n```\n\n```\n````\n\n後", ["````md\n```\n\n```\n````", "後"]],
    ["前\n\n```\na\n\n", ["前", "```\na\n\n"]],
    // 数式ブロックの中の空行
    ["$$\nx\n\ny\n$$\n\n後", ["$$\nx\n\ny\n$$", "後"]],
    // ゆるいリスト・番号付き・入れ子・リストのあとの段落
    ["- a\n\n- b\n\n段落", ["- a\n\n- b", "段落"]],
    ["1. a\n\n2. b", ["1. a\n\n2. b"]],
    ["- a\n\n  - b\n\n    続き\n\n- c", ["- a\n\n  - b\n\n    続き\n\n- c"]],
    // 字下げのコード
    ["段落\n\n    code\n\n    more\n\n後", ["段落\n\n    code\n\n    more", "後"]],
    // HTML のコメント・pre
    ["<!--\na\n\nb\n-->\n\n後", ["<!--\na\n\nb\n-->", "後"]],
    ["<!-- 1 行 -->\n\n後", ["<!-- 1 行 -->", "後"]],
    ["<pre>\na\n\nb</pre>\n\n後", ["<pre>\na\n\nb</pre>", "後"]],
    // 参照の定義・脚注があれば分けない
    ["[a]\n\n[a]: https://example.com", ["[a]\n\n[a]: https://example.com"]],
    ["本文[^1]\n\n[^1]: 注", ["本文[^1]\n\n[^1]: 注"]],
    // コードの中の参照の形は数えない
    ["```\n[a]: x\n```\n\n後", ["```\n[a]: x\n```", "後"]],
    ["", [""]],
  ];
  for (const [text, blocks] of cases) assert.deepEqual(splitBlocks(text), blocks, JSON.stringify(text));
});

test("createBlockSplitter: 1 字ずつ足していった結果が、各時点で一度に分けたものと同じ。前と同じ範囲のブロックは同じ文字列を返す", () => {
  const text = "# 題\n\n段落 **太字**\n\n- a\n\n- b\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$$\nx\n\n$$\n\n<!--\n\n-->\n\n    code\n\n終わり\n";
  const splitter = createBlockSplitter();
  let prev: string[] = [];
  for (let i = 0; i <= text.length; i++) {
    const { blocks } = splitter.split(text.slice(0, i));
    assert.deepEqual(blocks, splitBlocks(text.slice(0, i)), String(i));
    for (let b = 0; b < blocks.length - 1 && b < prev.length - 1; b++) if (blocks[b] === prev[b]) assert.ok(Object.is(blocks[b], prev[b]));
    prev = blocks;
  }
  // 続きでない文は読み直す
  assert.deepEqual(splitter.split("別\n\n文").blocks, ["別", "文"]);
});

test("createBlockSplitter: 最後のブロックで閉じていないコードブロックの開きの位置", () => {
  const splitter = createBlockSplitter();
  assert.equal(splitter.split("前\n\n説明\n```mermaid\ngraph").openFence, 3);
  assert.equal(splitter.split("前\n\n説明\n```mermaid\ngraph\n```").openFence, null);
  assert.equal(createBlockSplitter().split("前\n\n```ts\nconst a").openFence, 0);
});
