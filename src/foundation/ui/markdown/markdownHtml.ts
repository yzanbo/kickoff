// 書式付きコピーの HTML（返答を、ほかのアプリに貼っても見出し・表・コードが崩れないようにする）
import type { Element, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import { createPipeline, markdownToHast, type MarkdownPipeline } from "./markdownProcessor";
import { splitBlocks } from "./streaming/markdownBlocks";
import { markdownRemarkPlugins } from "./syntax/markdownPlugins";

/** コピーの処理の組（表示と同じ設定の組。数式・ファイルのチップは入れない。初めてコピーしたときに作る） */
let copyPipeline: MarkdownPipeline | null = null;

/** Markdown として読まずに、書いたままの文字で書くブロック（表示の .markdown-plain と同じ扱い） */
const plain = (text: string): Element => ({ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: text }] });

/**
 * 読み上げ用に画面から隠す要素（脚注の見出し h2.sr-only）を外す。貼った先には隠す CSS がないので、見出しがそのまま見えてしまう
 */
function withoutScreenReaderOnly(tree: Root): Root {
  visit(tree, "element", (node, index, parent) => {
    const classes = node.properties.className;
    if (parent && typeof index === "number" && Array.isArray(classes) && classes.includes("sr-only")) {
      parent.children.splice(index, 1);
      return index;
    }
    return undefined;
  });
  return tree;
}

/**
 * Markdown を HTML にする。表示と同じ読み方（設定の組 `syntax/markdownPlugins.ts`・ブロックに分けて読む・読めないブロックは文字のまま）で、
 * 数式は書いたとおりの式の文字のまま入る。脚注の見出し（画面では読み上げ用に隠すもの）は入れない。文中の HTML は動かさずに文字として書く（貼った先で動かないように。文字と属性の値は &lt; などの形にする）
 */
export function markdownToHtml(markdown: string): string {
  copyPipeline ??= createPipeline(markdownRemarkPlugins(), []);
  const pipeline = copyPipeline;
  return splitBlocks(markdown)
    .map((block): Root => markdownToHast(pipeline, block) ?? { type: "root", children: [plain(block)] })
    .map((tree) => toHtml(withoutScreenReaderOnly(tree)))
    .join("\n");
}
