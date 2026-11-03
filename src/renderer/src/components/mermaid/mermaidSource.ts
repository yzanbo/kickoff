import type { Element, ElementContent } from "hast";

const textOf = (node: ElementContent): string => (node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "");

/**
 * Markdown のコードブロック（<pre><code class="language-xxx">）の言語と中身（最後の改行は除く）。
 * 言語の指定がなければ language は空。コードブロックでなければ undefined
 */
export function codeBlockOf(pre: Element | undefined): { language: string; text: string } | undefined {
  const code = pre?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  if (!code) return undefined;
  const classes = code.properties.className;
  const languageClass = Array.isArray(classes) ? classes.map(String).find((c) => c.startsWith("language-")) : undefined;
  return { language: languageClass?.slice("language-".length).toLowerCase() ?? "", text: code.children.map(textOf).join("").replace(/\n$/, "") };
}

/** Markdown の ```mermaid のコードブロック（<pre><code class="language-mermaid">）なら、その中身を返す */
export function mermaidSource(pre: Element | undefined): string | undefined {
  const block = codeBlockOf(pre);
  return block?.language === "mermaid" ? block.text : undefined;
}
