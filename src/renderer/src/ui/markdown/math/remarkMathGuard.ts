import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import { isSingleDollarMath } from "@shared/markdown/mathGuard";

/** remark-math が作る数式の節（mdast の型にはないので、ここで形を書く） */
interface InlineMath {
  type: "inlineMath";
  value: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/** 段落の数式（remark-math の math の節と同じ形。HTML にするときの形 data も同じにする） */
interface MathBlock {
  type: "math";
  value: string;
  data: { hName: "pre"; hChildren: [{ type: "element"; tagName: "code"; properties: { className: string[] }; children: [{ type: "text"; value: string }] }] };
}

type Node = RootContent | PhrasingContent | InlineMath | MathBlock;

const isInlineMath = (node: { type: string }): node is InlineMath => node.type === "inlineMath";

/**
 * remark-math のあとに流す決まり（1 つの $ は中身が数式らしいときだけ数式にする。`@shared/markdown/mathGuard`）。
 * - 1 つの $ で囲んだ数式のうち、決まりに合わないもの（値段・シェルの変数）は、元の文（$ も含めて）に戻す
 * - $$…$$ が段落にそれだけで書いてあれば、段落の数式にする（文の中の $$ は文の中の数式のまま）
 */
export function remarkMathGuard() {
  return (tree: Root, file: { value: unknown }) => {
    const source = typeof file.value === "string" ? file.value : String(file.value ?? "");
    walk(tree, source);
  };
}

function walk(parent: { children: Node[] }, source: string) {
  parent.children = parent.children.map((child): Node => {
    if (isInlineMath(child)) return guardInline(child, source);
    if (child.type === "paragraph") {
      walk(child as unknown as { children: Node[] }, source);
      return displayOf(child, source) ?? child;
    }
    if ("children" in child && Array.isArray(child.children)) walk(child as unknown as { children: Node[] }, source);
    return child;
  });
}

/** 書いた元の文（位置がなければ null） */
function sourceOf(node: InlineMath, source: string): string | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? null : source.slice(start, end);
}

/** 1 つの $ の数式で、決まりに合わないものは元の文に戻す */
function guardInline(node: InlineMath, source: string): Node {
  const raw = sourceOf(node, source);
  if (raw === null || raw.startsWith("$$")) return node;
  const start = node.position!.start.offset!;
  const end = node.position!.end.offset!;
  const before = start > 0 ? source[start - 1] : undefined;
  const after = end < source.length ? source[end] : undefined;
  if (isSingleDollarMath(node.value, before, after)) return node;
  return { type: "text", value: raw };
}

/** 段落が $$…$$ の数式 1 つだけなら、段落の数式にする */
function displayOf(paragraph: Paragraph, source: string): MathBlock | null {
  const nodes = (paragraph.children as Node[]).filter((n) => !(n.type === "text" && n.value.trim() === ""));
  if (nodes.length !== 1) return null;
  const only = nodes[0];
  if (!isInlineMath(only)) return null;
  const raw = sourceOf(only, source);
  if (!raw?.startsWith("$$")) return null;
  const code = {
    type: "element",
    tagName: "code",
    properties: { className: ["language-math", "math-display"] },
    children: [{ type: "text", value: only.value }],
  } satisfies MathBlock["data"]["hChildren"][0];
  return { type: "math", value: only.value, data: { hName: "pre", hChildren: [code] } };
}
