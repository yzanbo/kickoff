import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isRiskyMarkdownBlock } from "./markdownGuard";
import { createPipeline, pipelineOf, renderBlock } from "./markdownProcessor";

const fence = (body: string, mark = "```") => `${mark}c\n${body}\n${mark}`;

test("isRiskyMarkdownBlock: 固まる・スタックがあふれる形は当たる", () => {
  assert.equal(isRiskyMarkdownBlock(">".repeat(3_000) + " a"), true);
  assert.equal(isRiskyMarkdownBlock("*a".repeat(50_000)), true);
  assert.equal(isRiskyMarkdownBlock("~a".repeat(7_000)), true);
  assert.equal(isRiskyMarkdownBlock("_a".repeat(20_000)), true);
  assert.equal(isRiskyMarkdownBlock("* ".repeat(2_000) + "a"), true);
  assert.equal(isRiskyMarkdownBlock("> - ".repeat(60) + "a"), true);
  assert.equal(isRiskyMarkdownBlock(Array.from({ length: 200 }, (_, i) => `${"  ".repeat(i)}- a`).join("\n")), true);
  assert.equal(isRiskyMarkdownBlock("あ".repeat(300_001)), true);
});

test("isRiskyMarkdownBlock: 記号・空白・日本語の記号に接する _ は * と同じ重さで数える（前後とも文字の snake_case は軽く数える）", () => {
  for (const unit of ["_.", "_!", "_)", "_「", "a_(", "a_ "]) assert.equal(isRiskyMarkdownBlock(unit.repeat(6_100)), true, unit);
  assert.equal(isRiskyMarkdownBlock("a_b".repeat(12_100)), true);
  assert.equal(isRiskyMarkdownBlock("_.".repeat(5_000)), false);
  assert.equal(isRiskyMarkdownBlock("a_b".repeat(11_000)), false);
  assert.equal(isRiskyMarkdownBlock("user_id と created_at と 漢字_かな ".repeat(2_000)), false);
  // 文の中のコードの _ も数える（ふつうの量なら当たらない）
  assert.equal(isRiskyMarkdownBlock("`_._._._._.` ".repeat(3_000)), true);
  assert.equal(isRiskyMarkdownBlock("`a_b` と `**kwargs` ".repeat(1_000)), false);
});

test("isRiskyMarkdownBlock: リンクの [ ] ( が多い・深い形（「[a](」の繰り返し・開きのない ]・[ の入れ子）は当たる", () => {
  assert.equal(isRiskyMarkdownBlock("[a](".repeat(25_000)), true);
  assert.equal(isRiskyMarkdownBlock("[a](b) ".repeat(5_001)), true);
  assert.equal(isRiskyMarkdownBlock("](x)".repeat(10_000)), true);
  assert.equal(isRiskyMarkdownBlock(("]" + "\\!".repeat(20)).repeat(700)), true);
  assert.equal(isRiskyMarkdownBlock("![".repeat(33) + "a" + "](b)".repeat(33)), true);
  // 行をまたいでも数える
  assert.equal(isRiskyMarkdownBlock("]x\n".repeat(3_000)), true);
});

test("isRiskyMarkdownBlock: ふつうのリンク・画像の入ったリンク・チェックリスト・\\[ と、文の中のコードのふつうの量の [ ] は当たらない", () => {
  assert.equal(isRiskyMarkdownBlock("[リンク](https://example.com/a) ".repeat(3_000)), false);
  assert.equal(isRiskyMarkdownBlock("[![画像](https://example.com/i.png)](https://example.com) ".repeat(2_000)), false);
  assert.equal(isRiskyMarkdownBlock("- [ ] やること\n- [x] 済んだこと\n".repeat(1_000)), false);
  assert.equal(isRiskyMarkdownBlock("\\[".repeat(200) + "`[[[[`".repeat(5) + "a]"), false);
  assert.equal(isRiskyMarkdownBlock("`a[0]` と `[x](y)` ".repeat(1_000)), false);
  assert.equal(isRiskyMarkdownBlock("![".repeat(32) + "a" + "](b)".repeat(32)), false);
});

test("isRiskyMarkdownBlock: 組まない ` で囲んだように見せた強調の記号・リンクの [ ] ( も数え、読み取りが 500ms 以内に終わる（\\` で閉じたように見せても同じ）", () => {
  const pipeline = pipelineOf(undefined, null);
  for (const body of ['"*a"'.repeat(16_000), "[a](".repeat(20_000)]) {
    for (const close of ["``", "\\`"]) {
      const text = "`" + body + close;
      assert.equal(isRiskyMarkdownBlock(text), true, close);
      const start = performance.now();
      renderToStaticMarkup(renderBlock(pipeline, text, {}).element);
      assert.ok(performance.now() - start < 500, `${body.slice(0, 4)} ${close}`);
    }
  }
});

test("isRiskyMarkdownBlock: ふつうの返答（長いコード・大きな表・強調の多い文）は当たらない", () => {
  assert.equal(isRiskyMarkdownBlock("**太字** と *斜体* と ~~取り消し~~ と snake_case_name"), false);
  assert.equal(isRiskyMarkdownBlock("| a | b |\n|---|---|\n" + "| **x** | `a_b_c` |\n".repeat(1_000)), false);
  assert.equal(isRiskyMarkdownBlock("> > 引用の引用\n> - 箇条書き\n>   - 入れ子"), false);
  assert.equal(isRiskyMarkdownBlock(Array.from({ length: 12 }, (_, i) => `${"  ".repeat(i)}- 入れ子 ${i}`).join("\n")), false);
  // 一番上のコードブロックの中は数えない（C のポインタ・Python の名前・区切りの線）
  assert.equal(isRiskyMarkdownBlock(fence("int **p = *q * *r; // ********\n".repeat(2_000))), false);
  assert.equal(isRiskyMarkdownBlock(fence("def __init__(self, a_b, c_d):\n".repeat(5_000), "~~~~")), false);
  assert.equal(isRiskyMarkdownBlock(fence(`${" ".repeat(300)}x\n`.repeat(10))), false);
});

test("isRiskyMarkdownBlock: コードブロックに見せかけた行の後ろも数える（``` の言語名の `・字下げ 4 つ・閉じたあと）", () => {
  assert.equal(isRiskyMarkdownBlock("```a`b\n" + "*a".repeat(7_000)), true);
  assert.equal(isRiskyMarkdownBlock("    ```\n" + "*a".repeat(7_000)), true);
  assert.equal(isRiskyMarkdownBlock("```\nx\n```\n" + "*a".repeat(7_000)), true);
  // ~~~ の中の ``` では閉じない
  assert.equal(isRiskyMarkdownBlock("~~~\n```\n" + "*a".repeat(7_000) + "\n~~~"), false);
});

test("renderMarkdown: 危ない形・読む途中で投げたブロックは、書いたままの文字で出す", () => {
  const pipeline = pipelineOf(undefined, null);
  const quotes = ">".repeat(3_000) + " a";
  assert.equal(renderToStaticMarkup(renderBlock(pipeline, quotes, {}).element), `<p class="markdown-plain">${"&gt;".repeat(3_000)} a</p>`);
  const throwing = createPipeline(
    [
      () => () => {
        throw new Error("壊れた");
      },
    ],
    [],
  );
  assert.equal(renderToStaticMarkup(renderBlock(throwing, "**a**\nb", {}).element), '<p class="markdown-plain">**a**\nb</p>');
  assert.equal(renderToStaticMarkup(renderBlock(pipeline, "**a**", {}).element), "<p><strong>a</strong></p>");
});
