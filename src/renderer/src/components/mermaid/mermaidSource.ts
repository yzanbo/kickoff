import type { Element, ElementContent } from "hast";

const textOf = (node: ElementContent): string => (node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "");

/** Markdown の ```mermaid のコードブロック（<pre><code class="language-mermaid">）なら、その中身を返す */
export function mermaidSource(pre: Element | undefined): string | undefined {
  const code = pre?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  const classes = code?.properties.className;
  if (!code || !Array.isArray(classes) || !classes.some((c) => String(c).toLowerCase() === "language-mermaid")) return undefined;
  return code.children.map(textOf).join("").replace(/\n$/, "");
}
